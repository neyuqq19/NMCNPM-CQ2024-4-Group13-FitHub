import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type AccountStatus } from "@prisma/client";
import type {
  CreateMemberRequest,
  UpdateMemberRequest,
} from "@fithub/contracts";
import { PrismaService } from "../../database/prisma.service";
import { invalid } from "./members.validation";

const includeMember = {
  user: true,
  memberships: {
    orderBy: { startsOn: "desc" as const },
    include: { payment: true },
  },
};
type Profile = Prisma.MemberProfileGetPayload<{
  include: typeof includeMember;
}>;
function summary(m: Profile["memberships"][number]) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const start = m.startsOn.toISOString().slice(0, 10),
    end = m.endsBefore.toISOString().slice(0, 10);
  const status = ["ACTIVE", "SCHEDULED"].includes(m.status)
    ? end <= today
      ? "EXPIRED"
      : start <= today
        ? "ACTIVE"
        : "SCHEDULED"
    : m.status;
  return {
    id: m.id,
    code: m.code,
    packageName: m.packageNameSnapshot,
    status,
    startsOn: start,
    endsBefore: end,
    durationMonths: m.durationMonthsSnapshot,
    ptSessionsRemaining: m.ptSessionsRemaining,
  };
}
function detail(p: Profile) {
  return {
    id: p.id,
    memberCode: p.memberCode,
    displayName: p.user.displayName,
    email: p.user.email,
    phone: p.user.phone,
    accountStatus: p.user.status,
    verifiedAt: p.user.verifiedAt?.toISOString() || null,
    version: p.version,
    createdAt: p.createdAt.toISOString(),
    totalSpent: p.memberships.reduce(
      (total, membership) =>
        total +
        (membership.payment?.status === "CONFIRMED"
          ? Number(membership.payment.amount)
          : 0),
      0,
    ),
    dateOfBirth: p.dateOfBirth?.toISOString().slice(0, 10) || null,
    gender: p.gender,
    address: p.address,
    heightCm: p.heightCm === null ? null : Number(p.heightCm),
    weightKg: p.weightKg === null ? null : Number(p.weightKg),
    injuryHistory: p.injuryHistory,
    memberships: p.memberships.map(summary),
    purchaseHistory: [...p.memberships]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((m) => ({
        ...summary(m),
        registeredAt: m.createdAt.toISOString(),
        price: Number(m.priceSnapshot),
        payment: m.payment
          ? {
              code: m.payment.code,
              amount: Number(m.payment.amount),
              method: m.payment.method,
              status: m.payment.status,
              confirmedAt: m.payment.confirmedAt?.toISOString() || null,
            }
          : null,
      })),
  };
}
function profileData(input: CreateMemberRequest | UpdateMemberRequest) {
  return {
    ...("dateOfBirth" in input
      ? { dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null }
      : {}),
    ...("gender" in input ? { gender: input.gender || null } : {}),
    ...("address" in input ? { address: input.address || null } : {}),
    ...("heightCm" in input ? { heightCm: input.heightCm ?? null } : {}),
    ...("weightKg" in input ? { weightKg: input.weightKg ?? null } : {}),
    ...("injuryHistory" in input
      ? { injuryHistory: input.injuryHistory || null }
      : {}),
  };
}
function conflict(code: string, message: string, extra = {}) {
  throw new ConflictException({ code, message, ...extra });
}

@Injectable()
export class MembersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  requireAdmin(role: string) {
    if (role !== "ADMIN")
      throw new ForbiddenException({
        code: "FORBIDDEN_ROLE",
        message: "Chỉ Admin có quyền quản lý hội viên.",
      });
  }
  async getOverview() {
    // Count profiles (rather than all MEMBER accounts, which may lack a profile).
    const counts = await this.prisma.user.groupBy({
      by: ["status"],
      where: { memberProfile: { isNot: null } },
      _count: { _all: true },
    });
    const count = (status: AccountStatus) =>
      counts.find((item) => item.status === status)?._count._all || 0;
    return {
      total: counts.reduce((sum, item) => sum + item._count._all, 0),
      active: count("ACTIVE"),
      pendingVerification: count("PENDING_VERIFY"),
      unavailable: count("LOCKED") + count("DEACTIVATED"),
    };
  }
  async listMembers(role: string, query: Record<string, string> = {}) {
    this.requireAdmin(role);
    if (Object.values(query).some((value) => typeof value !== "string"))
      invalid({ query: "Tham số tìm kiếm không hợp lệ." });
    const page = Number(query.page || 1),
      pageSize = Number(query.pageSize || 20);
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100
    )
      invalid({ page: "Phân trang không hợp lệ (1–100 dòng/trang)." });
    if (
      query.status &&
      !["ACTIVE", "PENDING_VERIFY", "LOCKED", "DEACTIVATED"].includes(
        query.status,
      )
    )
      invalid({ status: "Trạng thái không hợp lệ." });
    const q = (query.q || "").trim().slice(0, 254);
    // Accent-insensitive Vietnamese name lookup without requiring a database extension.
    const accents =
      "àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ";
    const plain = accents
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d");
    const normalized = q
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d");
    const escaped = normalized.replace(/[\\%_]/g, "\\$&");
    const nameMatches = q
      ? await this.prisma.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT p."id" FROM "MemberProfile" p JOIN "User" u ON u."id" = p."userId" WHERE translate(lower(u."displayName"), ${accents}, ${plain}) LIKE ${"%" + escaped + "%"}`,
        )
      : [];
    const where: Prisma.MemberProfileWhereInput = {
      ...(query.status
        ? { user: { status: query.status as AccountStatus } }
        : {}),
      ...(q
        ? {
            OR: [
              { memberCode: { contains: q, mode: "insensitive" } },
              { id: { in: nameMatches.map((p) => p.id) } },
              { user: { email: { contains: q, mode: "insensitive" } } },
              {
                user: {
                  phone: {
                    contains: q.replace(/[\s.-]/g, "").replace(/^\+84/, "0"),
                    mode: "insensitive",
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [total, profiles] = await this.prisma.$transaction([
      this.prisma.memberProfile.count({ where }),
      this.prisma.memberProfile.findMany({
        where,
        include: includeMember,
        orderBy: { memberCode: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      items: profiles.map((p) => ({
        id: p.id,
        memberCode: p.memberCode,
        displayName: p.user.displayName,
        email: p.user.email,
        phone: p.user.phone,
        accountStatus: p.user.status,
        verifiedAt: p.user.verifiedAt?.toISOString() || null,
        version: p.version,
        latestMembership: p.memberships[0] ? summary(p.memberships[0]) : null,
      })),
      total,
      page,
      pageSize,
    };
  }
  async getMember(id: string) {
    const p = await this.prisma.memberProfile.findUnique({
      where: { id },
      include: includeMember,
    });
    if (!p)
      throw new NotFoundException({
        code: "MEMBER_NOT_FOUND",
        message: "Không tìm thấy hồ sơ hội viên.",
      });
    return detail(p);
  }
  async createMember(actorId: string, input: CreateMemberRequest) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const contacts: Prisma.UserWhereInput[] = [];
        if (input.email) contacts.push({ email: input.email });
        if (input.phone) contacts.push({ phone: input.phone });
        const matches = await tx.user.findMany({
          where: { OR: contacts },
          include: { memberProfile: true },
        });
        if (matches.length > 1)
          conflict(
            "CONTACT_CONFLICT",
            "Số điện thoại và email thuộc hai tài khoản khác nhau.",
            { fieldErrors: { contact: "Không thể gộp hai tài khoản." } },
          );
        let user = matches[0];
        if (user) {
          if (user.role !== "MEMBER")
            conflict(
              "CONTACT_ROLE_CONFLICT",
              "Liên hệ thuộc tài khoản Admin/PT.",
              { fieldErrors: { contact: "Không thể đổi vai trò tài khoản." } },
            );
          if (user.memberProfile)
            conflict("MEMBER_EXISTS", "Hội viên đã có hồ sơ.", {
              memberId: user.memberProfile.id,
            });
          if (user.status === "DEACTIVATED")
            conflict(
              "ACCOUNT_DEACTIVATED",
              "Tài khoản đã ngừng sử dụng; không thể bổ sung hồ sơ.",
            );
          if (input.existingUserId !== user.id)
            conflict(
              "CONFIRM_EXISTING_ACCOUNT",
              "Tài khoản Member đã tồn tại. Xác nhận bổ sung hồ sơ vào tài khoản này?",
              { existingUserId: user.id },
            );
          // Never overwrite the existing account identity or add unverified login contacts.
          if (
            (input.email && input.email !== user.email) ||
            (input.phone && input.phone !== user.phone)
          )
            conflict(
              "CONTACT_CONFLICT",
              "Chỉ dùng liên hệ đã gắn với tài khoản hiện có.",
              {
                fieldErrors: {
                  contact:
                    "Không bổ sung liên hệ đăng nhập bằng thao tác tạo hồ sơ.",
                },
              },
            );
        } else {
          if (input.existingUserId)
            conflict(
              "CONTACT_CHANGED",
              "Thông tin tài khoản đã thay đổi. Hãy kiểm tra lại.",
            );
          user = await tx.user.create({
            data: {
              displayName: input.displayName,
              email: input.email,
              phone: input.phone,
              role: "MEMBER",
              status: "PENDING_VERIFY",
            },
            include: { memberProfile: true },
          });
        }
        const [next] = await tx.$queryRaw<
          { value: bigint }[]
        >`SELECT nextval('fithub_member_code_seq') AS value`;
        const p = await tx.memberProfile.create({
          data: {
            ...profileData(input),
            userId: user.id,
            memberCode: `HV${String(next.value).padStart(6, "0")}`,
          },
          include: includeMember,
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: "MEMBER_CREATE",
            entityType: "MemberProfile",
            entityId: p.id,
            changedFields: ["profile"],
          },
        });
        return detail(p);
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      )
        conflict(
          "CONTACT_CONFLICT",
          "Liên hệ vừa được sử dụng. Hãy tìm hồ sơ trước khi thử lại.",
          { fieldErrors: { contact: "Thông tin liên hệ bị trùng." } },
        );
      throw e;
    }
  }
  async updateMember(actorId: string, id: string, input: UpdateMemberRequest) {
    return this.prisma.$transaction(async (tx) => {
      const p = await tx.memberProfile.findUnique({
        where: { id },
        include: { user: true },
      });
      if (!p)
        throw new NotFoundException({
          code: "MEMBER_NOT_FOUND",
          message: "Không tìm thấy hồ sơ.",
        });
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${p.userId}::uuid FOR UPDATE`;
      if (p.user.status === "DEACTIVATED")
        conflict(
          "ACCOUNT_DEACTIVATED",
          "Hồ sơ đã ngừng sử dụng, chỉ được xem.",
        );
      const changed = await tx.memberProfile.updateMany({
        where: { id, version: input.version },
        data: { ...profileData(input), version: { increment: 1 } },
      });
      if (changed.count !== 1)
        conflict(
          "VERSION_CONFLICT",
          "Hồ sơ đã thay đổi. Tải lại bản mới trước khi lưu.",
        );
      await tx.user.update({
        where: { id: p.userId },
        data: { displayName: input.displayName },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "MEMBER_UPDATE",
          entityType: "MemberProfile",
          entityId: id,
          changedFields: ["displayName", ...Object.keys(profileData(input))],
        },
      });
      return detail(
        await tx.memberProfile.findUniqueOrThrow({
          where: { id },
          include: includeMember,
        }),
      );
    });
  }
  async deactivateMember(
    actorId: string,
    id: string,
    version: number,
    reason: string,
  ) {
    if (
      !Number.isInteger(version) ||
      version < 0 ||
      typeof reason !== "string" ||
      !reason.trim() ||
      reason.length > 1000
    )
      invalid({
        reason:
          "Nhập lý do ngừng sử dụng (tối đa 1000 ký tự) và phiên bản hợp lệ.",
      });
    return this.prisma.$transaction(async (tx) => {
      const p = await tx.memberProfile.findUnique({
        where: { id },
        include: { user: true },
      });
      if (!p)
        throw new NotFoundException({
          code: "MEMBER_NOT_FOUND",
          message: "Không tìm thấy hồ sơ.",
        });
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${p.userId}::uuid FOR UPDATE`;
      if (p.user.status === "DEACTIVATED")
        return detail(
          await tx.memberProfile.findUniqueOrThrow({
            where: { id },
            include: includeMember,
          }),
        );
      const changed = await tx.memberProfile.updateMany({
        where: { id, version },
        data: { version: { increment: 1 } },
      });
      if (changed.count !== 1)
        conflict(
          "VERSION_CONFLICT",
          "Hồ sơ đã thay đổi. Tải lại trước khi ngừng sử dụng.",
        );
      await tx.user.update({
        where: { id: p.userId },
        data: { status: "DEACTIVATED" },
      });
      await tx.session.updateMany({
        where: { userId: p.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "MEMBER_DEACTIVATE",
          entityType: "MemberProfile",
          entityId: id,
          changedFields: ["status"],
          reason: reason.trim(),
        },
      });
      return detail(
        await tx.memberProfile.findUniqueOrThrow({
          where: { id },
          include: includeMember,
        }),
      );
    });
  }
  async getMyMembership(userId: string) {
    const profile = await this.prisma.memberProfile.findUnique({
      where: { userId },
      include: {
        memberships: {
          orderBy: { startsOn: "desc" },
          take: 1,
        },
      },
    });

    if (!profile) {
      return {
        hasProfile: false,
        memberCode: null,
        activeMembership: null,
      };
    }

    const latest = profile.memberships[0] || null;
    return {
      hasProfile: true,
      memberCode: profile.memberCode,
      activeMembership: latest
        ? {
            code: latest.code,
            packageName: latest.packageNameSnapshot,
            status: latest.status,
            startsOn: latest.startsOn,
            endsBefore: latest.endsBefore,
            grantsGymAccess: latest.grantsGymAccessSnapshot,
          }
        : null,
    };
  }
}
