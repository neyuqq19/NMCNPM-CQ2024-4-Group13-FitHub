import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type {
  CurrentUser,
  PaymentStatus,
  RegisterMembershipRequest,
  ConfirmPaymentRequest,
} from "@fithub/contracts";
import { PrismaService } from "../../database/prisma.service";
import { gymClock } from "../check-ins/eligibility";
import { InvoiceAdapter } from "../payments/invoice.adapter";
import {
  evaluateGrant,
  findOverlapBlock,
  grantPaidOrder,
} from "../payments/grant-paid-order";
import { includePayment, toPaymentDto } from "../payments/payment.mapper";
const dto = toPaymentDto;
function conflict(code: string, message: string): never {
  throw new ConflictException({ code, message });
}
function missing(): never {
  throw new NotFoundException({
    code: "PAYMENT_NOT_FOUND",
    message: "Không tìm thấy giao dịch.",
  });
}
export function addMonths(start: string, months: number) {
  const d = new Date(`${start}T00:00:00Z`),
    year = d.getUTCFullYear(),
    month = d.getUTCMonth() + months;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(d.getUTCDate(), last)));
}
@Injectable()
export class SalesService {
  constructor(
    @Inject(PrismaService) private db: PrismaService,
    @Inject(InvoiceAdapter) private invoices: InvoiceAdapter,
  ) {}
  private requireAdmin(user: CurrentUser) {
    if (user.role !== "ADMIN")
      throw new ForbiddenException({
        code: "ROLE_FORBIDDEN",
        message: "Chỉ Admin có quyền quản lý gói và khoản thu.",
      });
  }
  private async profile(
    tx: Prisma.TransactionClient,
    id: string,
    lock = false,
  ) {
    const p = await tx.memberProfile.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!p)
      throw new NotFoundException({
        code: "MEMBER_NOT_FOUND",
        message: "Không tìm thấy hội viên.",
      });
    if (lock) {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${p.userId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "MemberProfile" WHERE "id"=${id}::uuid FOR UPDATE`;
      return tx.memberProfile.findUniqueOrThrow({
        where: { id },
        include: { user: true },
      });
    }
    return p;
  }
  private eligible(p: { user: { status: string; verifiedAt: Date | null } }) {
    if (p.user.status !== "ACTIVE" || !p.user.verifiedAt)
      conflict(
        "MEMBER_NOT_ELIGIBLE",
        "Hội viên phải xác minh và có tài khoản đang hoạt động để đăng ký hoặc thanh toán.",
      );
  }
  private async actor(tx: Prisma.TransactionClient, user: CurrentUser) {
    this.requireAdmin(user);
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${user.id}::uuid FOR SHARE`;
    const actor = await tx.user.findUnique({ where: { id: user.id } });
    if (actor?.role !== "ADMIN" || actor.status !== "ACTIVE")
      throw new ForbiddenException({
        code: "ROLE_FORBIDDEN",
        message: "Tài khoản quản trị không còn hiệu lực.",
      });
  }
  async options(user: CurrentUser, id: string) {
    this.requireAdmin(user);
    return this.db.$transaction(async (tx) => {
      const p = await this.profile(tx, id);
      const [packages, paid, pending] = await Promise.all([
        tx.package.findMany({
          where: { isActive: true },
          orderBy: [{ durationMonths: "asc" }, { id: "asc" }],
        }),
        tx.membership.findMany({
          where: {
            memberId: id,
            grantsGymAccessSnapshot: true,
            status: { in: ["ACTIVE", "SCHEDULED", "FROZEN"] },
            payment: { status: "CONFIRMED" },
          },
          orderBy: { endsBefore: "desc" },
        }),
        tx.payment.findMany({
          where: {
            status: { in: ["PENDING", "FAILED"] },
            membership: { memberId: id },
          },
          orderBy: { createdAt: "desc" },
          select: { id: true, code: true },
        }),
      ]);
      const today = gymClock(new Date()).day;
      return {
        member: {
          id: p.id,
          memberCode: p.memberCode,
          displayName: p.user.displayName,
          accountStatus: p.user.status,
          verified: !!p.user.verifiedAt,
        },
        packages: packages.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          durationMonths: p.durationMonths,
          price: Number(p.price),
          grantsGymAccess: p.grantsGymAccess,
          accessWindow: p.accessWindow,
          ptSessionsIncluded: p.ptSessionsIncluded,
          isActive: p.isActive,
        })),
        suggestedStartsOn:
          paid[0] && paid[0].endsBefore.toISOString().slice(0, 10) > today
            ? paid[0].endsBefore.toISOString().slice(0, 10)
            : today,
        pendingPayments: pending,
      };
    });
  }
  private async checkOverlap(
    tx: Prisma.TransactionClient,
    memberId: string,
    start: Date,
    end: Date,
    except?: string,
  ) {
    const block = await findOverlapBlock(tx, memberId, start, end, except);
    if (block) conflict(block.code, block.message);
  }
  async register(
    user: CurrentUser,
    id: string,
    body: RegisterMembershipRequest,
  ) {
    return this.db
      .$transaction(
        async (tx) => {
          await this.actor(tx, user);
          const p = await this.profile(tx, id, true);
          const old = await tx.membership.findUnique({
            where: { requestId: body.requestId },
            include: { payment: { include: includePayment } },
          });
          if (old) {
            if (
              old.memberId !== id ||
              old.packageId !== body.packageId ||
              old.startsOn.toISOString().slice(0, 10) !== body.startsOn ||
              Number(old.priceSnapshot) !== body.expectedPrice
            )
              conflict(
                "REQUEST_CONFLICT",
                "Mã yêu cầu đã được dùng với thông tin đăng ký khác.",
              );
            if (!old.payment) missing();
            return dto(old.payment);
          }
          this.eligible(p);
          const today = gymClock(new Date()).day;
          const start = new Date(`${body.startsOn}T00:00:00Z`);
          if (
            !Number.isFinite(start.getTime()) ||
            start.toISOString().slice(0, 10) !== body.startsOn ||
            body.startsOn < today
          )
            throw new BadRequestException({
              code: "INVALID_START_DATE",
              message: "Ngày bắt đầu phải hợp lệ và không trước ngày hôm nay.",
            });
          await tx.$queryRaw`SELECT "id" FROM "Package" WHERE "id"=${body.packageId}::uuid FOR SHARE`;
          const pack = await tx.package.findUnique({
            where: { id: body.packageId },
          });
          if (!pack?.isActive)
            conflict(
              "PACKAGE_UNAVAILABLE",
              "Gói không còn được cung cấp. Vui lòng tải lại danh mục.",
            );
          if (Number(pack.price) !== body.expectedPrice)
            conflict(
              "PRICE_CHANGED",
              "Giá gói đã thay đổi. Tải lại danh mục trước khi xác nhận.",
            );
          const end = addMonths(body.startsOn, pack.durationMonths);
          if (pack.grantsGymAccess) {
            if (body.startsOn > today) {
              const existingScheduled = await tx.membership.findFirst({
                where: {
                  memberId: id,
                  grantsGymAccessSnapshot: true,
                  status: "SCHEDULED",
                },
              });
              if (existingScheduled) {
                conflict(
                  "SCHEDULED_LIMIT_REACHED",
                  "Hội viên đã có 1 gói gia hạn chờ kích hoạt (SCHEDULED).",
                );
              }
            }
            await this.checkOverlap(tx, id, start, end);
          }
          const [codes] = await tx.$queryRaw<
            { m: bigint; p: bigint }[]
          >`SELECT nextval('fithub_membership_code_seq') AS m, nextval('fithub_payment_code_seq') AS p`;
          const m = await tx.membership.create({
            data: {
              code: `DK${String(codes.m).padStart(6, "0")}`,
              requestId: body.requestId,
              memberId: id,
              packageId: pack.id,
              packageNameSnapshot: pack.name,
              durationMonthsSnapshot: pack.durationMonths,
              priceSnapshot: pack.price,
              grantsGymAccessSnapshot: pack.grantsGymAccess,
              ptSessionsSnapshot: pack.ptSessionsIncluded,
              ptSessionsRemaining: pack.ptSessionsIncluded,
              status: "PENDING_PAYMENT",
              startsOn: start,
              endsBefore: end,
            },
          });
          const payment = await tx.payment.create({
            data: {
              code: `GD${String(codes.p).padStart(6, "0")}`,
              membershipId: m.id,
              amount: pack.price,
              idempotencyKey: randomUUID(),
            },
            include: includePayment,
          });
          await tx.auditLog.create({
            data: {
              actorId: user.id,
              action: "MEMBERSHIP_REGISTER",
              entityType: "Membership",
              entityId: m.id,
              changedFields: ["packageId", "startsOn", "endsBefore", "status"],
            },
          });
          return dto(payment);
        },
        { timeout: 15000 },
      )
      .catch((error: unknown) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        )
          conflict(
            "REQUEST_CONFLICT",
            "Mã yêu cầu đã được sử dụng. Tải lại giao dịch để kiểm tra kết quả.",
          );
        throw error;
      });
  }
  async get(user: CurrentUser, id: string) {
    this.requireAdmin(user);
    const p = await this.db.payment.findUnique({
      where: { id },
      include: includePayment,
    });
    if (!p) missing();
    return dto(p);
  }
  async list(user: CurrentUser, q: Record<string, string>) {
    this.requireAdmin(user);
    const page = Number(q.page || 1),
      pageSize = Number(q.pageSize || 20);
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100 ||
      (q.status &&
        ![
          "PENDING",
          "CONFIRMED",
          "CANCELLED",
          "FAILED",
          "NEEDS_REVIEW",
        ].includes(q.status)) ||
      (q.member &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          q.member,
        )) ||
      Object.values(q).some((x) => typeof x !== "string")
    )
      throw new BadRequestException({
        code: "INVALID_QUERY",
        message: "Bộ lọc hoặc phân trang không hợp lệ.",
      });
    const term = (q.q || "").trim().slice(0, 100);
    const where: Prisma.PaymentWhereInput = {
      // NEEDS_REVIEW: các khoản cần Admin đối soát (chưa cấp quyền lợi hoặc thu trùng).
      ...(q.status === "NEEDS_REVIEW"
        ? { reconciliationStatus: "MISMATCHED" }
        : q.status
          ? { status: q.status as PaymentStatus }
          : {}),
      ...(q.member ? { membership: { memberId: q.member } } : {}),
      ...(term
        ? {
            OR: [
              { code: { contains: term, mode: "insensitive" } },
              {
                membership: {
                  member: {
                    memberCode: { contains: term, mode: "insensitive" },
                  },
                },
              },
              {
                membership: {
                  member: {
                    user: {
                      displayName: { contains: term, mode: "insensitive" },
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [total, items] = await this.db.$transaction([
      this.db.payment.count({ where }),
      this.db.payment.findMany({
        where,
        include: includePayment,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items: items.map(dto), total, page, pageSize };
  }
  async decide(
    user: CurrentUser,
    id: string,
    body: ConfirmPaymentRequest | null,
  ) {
    const result = await this.db
      .$transaction(
        async (tx) => {
          await this.actor(tx, user);
          const found = await tx.payment.findUnique({
            where: { id },
            include: includePayment,
          });
          if (!found) missing();
          const p = await this.profile(tx, found.membership.memberId, true);
          await tx.$queryRaw`SELECT "id" FROM "Membership" WHERE "id"=${found.membershipId}::uuid FOR UPDATE`;
          await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id"=${id}::uuid FOR UPDATE`;
          const current = await tx.payment.findUniqueOrThrow({
            where: { id },
            include: includePayment,
          });
          if (!body) {
            if (current.status === "CONFIRMED")
              conflict(
                "ALREADY_CONFIRMED",
                "Khoản thu đã xác nhận, không thể hủy bằng thao tác này.",
              );
            if (current.status === "CANCELLED") return dto(current);
            await tx.membership.update({
              where: { id: current.membershipId },
              data: { status: "CANCELLED", version: { increment: 1 } },
            });
            await tx.payment.update({
              where: { id },
              data: { status: "CANCELLED" },
            });
          } else {
            if (Number(current.amount) !== body.amount)
              conflict(
                "AMOUNT_MISMATCH",
                "Số tiền không khớp với khoản thu cần xác nhận.",
              );
            // BR04: cùng idempotencyKey → trả lại kết quả đã lưu; khác khóa hoặc đã hủy → đã xử lý.
            if (current.status === "CONFIRMED") {
              if (current.idempotencyKey === body.idempotencyKey)
                return dto(current);
              conflict(
                "PAYMENT_ALREADY_PROCESSED",
                "Giao dịch đã được xác nhận trước đó.",
              );
            }
            if (current.status === "CANCELLED")
              conflict(
                "PAYMENT_ALREADY_PROCESSED",
                "Giao dịch đã hủy. Vui lòng tạo đăng ký mới.",
              );
            this.eligible(p);
            const other = await tx.payment.findUnique({
              where: { idempotencyKey: body.idempotencyKey },
            });
            if (other && other.id !== id)
              conflict(
                "REQUEST_CONFLICT",
                "Mã xác nhận đã được dùng cho giao dịch khác.",
              );
            // Tránh thu hai lần: hội viên đang trong phiên thanh toán VNPay còn hạn.
            if (
              current.method === "VNPAY" &&
              current.status === "PENDING" &&
              current.vnpExpiresAt &&
              current.vnpExpiresAt > new Date()
            )
              conflict(
                "ONLINE_PAYMENT_IN_PROGRESS",
                "Hội viên đang thanh toán qua VNPay. Chờ kết quả hoặc hết hạn thanh toán rồi mới thu tại quầy.",
              );
            const m = current.membership,
              day = gymClock(new Date()).day;
            const block = await evaluateGrant(tx, m, p.user, day);
            if (block) conflict(block.code, block.message);
            // BR01: kích hoạt gói và xác nhận khoản thu trong cùng một transaction.
            await grantPaidOrder(tx, m, day);
            const method = body.method ?? "CASH";
            await tx.payment.update({
              where: { id },
              data: {
                status: "CONFIRMED",
                method,
                confirmedById: user.id,
                confirmedAt: new Date(),
                idempotencyKey: body.idempotencyKey,
                transferReference:
                  method === "BANK_TRANSFER"
                    ? body.reference?.trim() || null
                    : null,
                vnpExpiresAt: null,
                benefitStatus: "GRANTED",
              },
            });
          }
          await tx.auditLog.create({
            data: {
              actorId: user.id,
              action: body ? "PAYMENT_CONFIRM" : "PAYMENT_CANCEL",
              entityType: "Payment",
              entityId: id,
              changedFields: [
                "status",
                ...(body ? ["method", "confirmedAt", "confirmedById"] : []),
              ],
            },
          });
          return dto(
            await tx.payment.findUniqueOrThrow({
              where: { id },
              include: includePayment,
            }),
          );
        },
        { timeout: 15000 },
      )
      .catch((error: unknown) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        )
          conflict(
            "REQUEST_CONFLICT",
            "Mã yêu cầu đã được sử dụng. Tải lại giao dịch để kiểm tra kết quả.",
          );
        throw error;
      });
    // BR03/E2: hóa đơn nằm sau transaction thu tiền và không ném lỗi; hóa đơn lỗi
    // chỉ đánh dấu FAILED. Gọi cả khi trả lại kết quả cũ để hóa đơn sót vẫn được phát hành.
    if (body && result.status === "CONFIRMED") {
      await this.invoices.issueForPayment(id);
      return dto(
        await this.db.payment.findUniqueOrThrow({
          where: { id },
          include: includePayment,
        }),
      );
    }
    return result;
  }
  async dashboard(user: CurrentUser, query: Record<string, string> = {}) {
    this.requireAdmin(user);
    const today = gymClock(new Date()).day;
    const day = query.date ?? today;
    const range = query.range ?? "7d";
    if (
      typeof day !== "string" ||
      typeof range !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      !Number.isFinite(Date.parse(day)) ||
      new Date(day).toISOString().slice(0, 10) !== day ||
      day > today ||
      !["7d", "30d", "month"].includes(range)
    ) {
      throw new BadRequestException({
        code: "INVALID_DASHBOARD_QUERY",
        message: "Ngày hoặc khoảng thống kê không hợp lệ.",
      });
    }
    const first = new Date(`${day}T00:00:00Z`);
    if (range === "month") first.setUTCDate(1);
    else first.setUTCDate(first.getUTCDate() - (range === "7d" ? 6 : 29));
    const rangeStart = first.toISOString().slice(0, 10);
    const start = new Date(`${day}T00:00:00+07:00`),
      end = new Date(start.getTime() + 86400000);
    return this.db.$transaction(
      async (tx) => {
        const where: Prisma.PaymentWhereInput = {
          status: "CONFIRMED",
          code: { not: { startsWith: "GD-TESTQR-" } },
          confirmedAt: { gte: start, lt: end },
        };
        const [
          activeMembers,
          pendingMembers,
          checkInsToday,
          totals,
          recent,
          newMembers,
          checkIns,
        ] = await Promise.all([
          tx.memberProfile.count({
            where: { user: { status: "ACTIVE", verifiedAt: { not: null } } },
          }),
          tx.memberProfile.count({
            where: { user: { status: "PENDING_VERIFY" } },
          }),
          tx.checkInRecord.count({
            where: { checkedInAt: { gte: start, lt: end } },
          }),
          tx.payment.aggregate({
            where,
            _sum: { amount: true },
            _count: { _all: true },
          }),
          tx.payment.findMany({
            where,
            include: includePayment,
            orderBy: [{ confirmedAt: "desc" }, { id: "desc" }],
            take: 5,
          }),
          tx.memberProfile.count({
            where: { createdAt: { gte: start, lt: end } },
          }),
          tx.$queryRaw<
            { day: string; count: bigint }[]
          >`SELECT to_char("checkedInAt" AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS day, count(*) AS count FROM "CheckInRecord" WHERE "checkedInAt" >= ${new Date(`${rangeStart}T00:00:00+07:00`)} AND "checkedInAt" < ${end} GROUP BY day ORDER BY day`,
        ]);
        const checkInSeries: { date: string; count: number }[] = [];
        for (
          let cursor = first.getTime();
          cursor <= Date.parse(`${day}T00:00:00Z`);
          cursor += 86400000
        ) {
          const date = new Date(cursor).toISOString().slice(0, 10);
          checkInSeries.push({
            date,
            count: Number(checkIns.find((r) => r.day === date)?.count ?? 0),
          });
        }
        return {
          day,
          range,
          newMembers,
          checkInSeries,
          activeMembers,
          pendingMembers,
          checkInsToday,
          revenueToday: Number(totals._sum.amount || 0),
          confirmedPaymentsToday: totals._count._all,
          recentPayments: recent.map(dto),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
