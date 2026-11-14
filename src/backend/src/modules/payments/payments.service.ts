import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type {
  CreateVNPayUrlResponse,
  CurrentUser,
  InvoiceDto,
  MyPaymentDto,
  PaymentDetailDto,
  ReconcilePaymentRequest,
} from "@fithub/contracts";
import { PrismaService } from "../../database/prisma.service";
import { gymClock } from "../check-ins/eligibility";
import { InvoiceAdapter } from "./invoice.adapter";
import { VNPayAdapter } from "./vnpay.adapter";
import { makeTxnRef, parseTxnRef, type VnpCallback } from "./vnpay.crypto";
import {
  evaluateGrant,
  grantPaidOrder,
  lockPaymentChain,
  type GrantBlock,
} from "./grant-paid-order";
import {
  includePayment,
  toInvoiceDto,
  toMyPaymentDto,
  toPaymentDto,
} from "./payment.mapper";

/** Kết quả trả cho VNPay (RspCode theo tài liệu IPN) kèm mã HTTP và mã lỗi nội bộ. */
export interface IpnResult {
  httpStatus: number;
  RspCode: string;
  Message: string;
  code?: string;
}
type OnlineOutcome = "GRANTED" | "REVIEW" | "DUPLICATE" | "DUPLICATE_FLAGGED";

function conflict(code: string, message: string): never {
  throw new ConflictException({ code, message });
}
function missing(): never {
  throw new NotFoundException({
    code: "PAYMENT_NOT_FOUND",
    message: "Không tìm thấy giao dịch.",
  });
}
/** Chuẩn hóa IP gửi VNPay (IPv4); mặc định 127.0.0.1. */
export function clientIp(ip?: string): string {
  const v = (ip || "").replace(/^::ffff:/, "");
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(v) ? v : "127.0.0.1";
}
/** Chỉ giữ tham số vnp_* dạng chuỗi/số; mảng hoặc đối tượng bị từ chối. */
export function flattenVnpQuery(
  input: Record<string, unknown> | undefined,
): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (!key.startsWith("vnp_")) continue;
    if (typeof value === "string") out[key] = value;
    else if (typeof value === "number" || typeof value === "boolean")
      out[key] = String(value);
    else return null;
  }
  return out;
}
const safeLog = (v: unknown) => String(v ?? "").slice(0, 60).replace(/[^\w-]/g, "?");

@Injectable()
export class PaymentsService {
  private readonly log = new Logger(PaymentsService.name);
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(VNPayAdapter) private readonly vnpay: VNPayAdapter,
    @Inject(InvoiceAdapter) private readonly invoices: InvoiceAdapter,
  ) {}

  private requireAdmin(user: CurrentUser) {
    if (user.role !== "ADMIN")
      throw new ForbiddenException({
        code: "ROLE_FORBIDDEN",
        message: "Chỉ Admin có quyền thực hiện thao tác này.",
      });
  }
  private async load(id: string) {
    const p = await this.db.payment.findUnique({
      where: { id },
      include: includePayment,
    });
    if (!p) missing();
    return p;
  }
  /** Admin xem mọi giao dịch; hội viên chỉ xem giao dịch của mình (không lộ giao dịch người khác). */
  private async loadAuthorized(user: CurrentUser, id: string) {
    const p = await this.load(id);
    if (user.role === "ADMIN") return p;
    if (user.role === "MEMBER" && p.membership.member.userId === user.id)
      return p;
    return missing();
  }
  private async dto(id: string): Promise<PaymentDetailDto> {
    return toPaymentDto(await this.load(id));
  }

  // ───────────────────────── PAY-03: tạo URL VNPay ─────────────────────────
  async createVNPayUrl(
    user: CurrentUser,
    id: string,
    ip?: string,
  ): Promise<CreateVNPayUrlResponse> {
    if (user.role !== "ADMIN" && user.role !== "MEMBER")
      throw new ForbiddenException({
        code: "ROLE_FORBIDDEN",
        message: "Tài khoản này không được tạo thanh toán gói tập.",
      });
    void this.vnpay.config; // thiếu cấu hình thì báo lỗi sớm, trước khi ghi DB
    const now = new Date();
    const minutes = this.vnpay.expireMinutes;
    const out = await this.db.$transaction(
      async (tx) => {
        const p = await lockPaymentChain(tx, id);
        if (!p) missing();
        if (user.role === "MEMBER" && p.membership.member.userId !== user.id)
          missing();
        if (p.status === "CONFIRMED" || p.status === "CANCELLED")
          conflict(
            "PAYMENT_ALREADY_PROCESSED",
            "Giao dịch đã được xử lý, không thể tạo thanh toán mới.",
          );
        const block = await evaluateGrant(
          tx,
          p.membership,
          p.membership.member.user,
          gymClock(now).day,
        );
        if (block) conflict(block.code, block.message);
        // Bấm nhiều lần khi URL còn hạn: dùng lại cùng mã tham chiếu, không sinh mã mới.
        const reuse =
          p.status === "PENDING" &&
          p.method === "VNPAY" &&
          p.vnpTxnRef &&
          p.vnpExpiresAt &&
          p.vnpExpiresAt > now;
        let txnRef: string, expiresAt: Date, createdAt: Date;
        if (reuse) {
          txnRef = p.vnpTxnRef!;
          expiresAt = p.vnpExpiresAt!;
          createdAt = new Date(expiresAt.getTime() - minutes * 60000);
        } else {
          const attempts = p.vnpAttempts + 1;
          txnRef = makeTxnRef(p.code, attempts);
          createdAt = now;
          expiresAt = new Date(now.getTime() + minutes * 60000);
          await tx.payment.update({
            where: { id: p.id },
            data: {
              status: "PENDING", // FAILED → PENDING khi thử lại
              method: "VNPAY",
              vnpTxnRef: txnRef,
              vnpAttempts: attempts,
              vnpExpiresAt: expiresAt,
            },
          });
          await tx.auditLog.create({
            data: {
              actorId: user.id,
              action: "PAYMENT_VNPAY_URL",
              entityType: "Payment",
              entityId: p.id,
              changedFields: ["status", "method", "vnpTxnRef", "vnpExpiresAt"],
            },
          });
        }
        return { p, txnRef, expiresAt, createdAt };
      },
      { timeout: 15000 },
    );
    const amount = Number(out.p.amount);
    return {
      paymentId: out.p.id,
      paymentCode: out.p.code,
      paymentUrl: this.vnpay.buildRedirectUrl({
        txnRef: out.txnRef,
        amountVnd: amount,
        orderInfo: `Thanh toan goi tap ${out.p.code}`,
        ipAddr: clientIp(ip),
        createdAt: out.createdAt,
        expiresAt: out.expiresAt,
      }),
      txnRef: out.txnRef,
      amount,
      expiresAt: out.expiresAt.toISOString(),
      mode: this.vnpay.mode,
    };
  }

  // ─────────────────── PAY-03: IPN / webhook VNPay (công khai) ───────────────────
  private async findByTxnRef(ref: string) {
    const select = { id: true, code: true, amount: true, vnpAttempts: true };
    const exact = await this.db.payment.findUnique({
      where: { vnpTxnRef: ref },
      select,
    });
    if (exact) return exact;
    // Lần thử cũ (đã bị thay bằng mã mới) vẫn phải ghi nhận được nếu tiền đã vào.
    const parsed = parseTxnRef(ref);
    if (!parsed) return null;
    const p = await this.db.payment.findUnique({
      where: { code: parsed.code },
      select,
    });
    return p &&
      parsed.attempt <= p.vnpAttempts &&
      makeTxnRef(p.code, parsed.attempt) === ref
      ? p
      : null;
  }

  async handleVNPayCallback(
    input: Record<string, unknown> | undefined,
  ): Promise<IpnResult> {
    const query = flattenVnpQuery(input);
    // SR01: chữ ký là kiểm tra đầu tiên, trước mọi truy vấn dữ liệu.
    if (!query || !this.vnpay.verifySignature(query)) {
      this.log.warn(
        `VNPay IPN bị từ chối: chữ ký không hợp lệ (txnRef=${safeLog(query?.vnp_TxnRef)})`,
      );
      return {
        httpStatus: 400,
        RspCode: "97",
        Message: "Invalid signature",
        code: "INVALID_SIGNATURE",
      };
    }
    const cb = this.vnpay.parseCallback(query);
    if (!cb)
      return {
        httpStatus: 400,
        RspCode: "99",
        Message: "Invalid request",
        code: "INVALID_REQUEST",
      };
    const found = await this.findByTxnRef(cb.txnRef);
    if (!found)
      return {
        httpStatus: 404,
        RspCode: "01",
        Message: "Order not found",
        code: "PAYMENT_NOT_FOUND",
      };
    // SR02: không tin số tiền phía cổng; đối chiếu với số tiền đã lưu trong DB.
    if (cb.amountVnd !== Number(found.amount)) {
      this.log.warn(
        `VNPay IPN lệch số tiền (txnRef=${safeLog(cb.txnRef)}, nhận ${cb.amountVnd}, cần ${Number(found.amount)})`,
      );
      return {
        httpStatus: 400,
        RspCode: "04",
        Message: "Invalid amount",
        code: "AMOUNT_MISMATCH",
      };
    }
    try {
      if (!cb.success) {
        await this.applyOnlineFailure(found.id, cb);
        return { httpStatus: 200, RspCode: "00", Message: "Confirm Success" };
      }
      const outcome = await this.applyOnlineSuccess(found.id, cb);
      if (outcome === "DUPLICATE" || outcome === "DUPLICATE_FLAGGED")
        return {
          httpStatus: 200,
          RspCode: "00",
          Message: "Order already confirmed",
          code: "ALREADY_PROCESSED",
        };
      // Phản hồi VNPay không chờ xuất hóa đơn (BR03/E2): lỗi hóa đơn không ảnh hưởng khoản thu.
      void this.invoices.issueForPayment(found.id);
      return { httpStatus: 200, RspCode: "00", Message: "Confirm Success" };
    } catch (error) {
      if (error instanceof NotFoundException)
        return {
          httpStatus: 404,
          RspCode: "01",
          Message: "Order not found",
          code: "PAYMENT_NOT_FOUND",
        };
      this.log.error(
        `VNPay IPN xử lý lỗi (txnRef=${safeLog(cb.txnRef)}): ${error instanceof Error ? error.message : error}`,
      );
      // 5xx để VNPay gọi lại; lần gọi sau được xử lý idempotent.
      return {
        httpStatus: 500,
        RspCode: "99",
        Message: "Unknown error",
        code: "IPN_PROCESSING_ERROR",
      };
    }
  }

  /** E3: tiền đã vào thì luôn giữ trạng thái đã thu; lỗi cấp quyền lợi chuyển sang đối soát. */
  private async applyOnlineSuccess(
    id: string,
    cb: VnpCallback,
  ): Promise<OnlineOutcome> {
    try {
      return await this.confirmOnline(id, cb, true);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.log.error(
        `Cấp quyền lợi lỗi, chuyển sang đối soát (${id}): ${error instanceof Error ? error.message : error}`,
      );
      return this.confirmOnline(id, cb, false, "GRANT_ERROR");
    }
  }

  private confirmOnline(
    id: string,
    cb: VnpCallback,
    allowGrant: boolean,
    forcedReason?: string,
  ): Promise<OnlineOutcome> {
    return this.db.$transaction(
      async (tx): Promise<OnlineOutcome> => {
        const p = await lockPaymentChain(tx, id);
        if (!p) missing();
        const actorId = p.membership.member.userId;
        if (p.status === "CONFIRMED") {
          // BR04: cùng giao dịch gửi lại → không cấp lần hai, không tạo bản ghi trùng.
          if (p.method === "VNPAY" && p.vnpTxnRef === cb.txnRef)
            return "DUPLICATE";
          // Đã thu bằng kênh khác hoặc lần thử khác: ghi nhận khoản thu thừa để đối soát.
          if (p.reconciliationStatus !== "MISMATCHED") {
            await tx.payment.update({
              where: { id: p.id },
              data: { reconciliationStatus: "MISMATCHED" },
            });
            await tx.auditLog.create({
              data: {
                actorId,
                action: "PAYMENT_DUPLICATE_ONLINE",
                entityType: "Payment",
                entityId: p.id,
                changedFields: ["reconciliationStatus"],
                reason: `Nhận thêm khoản VNPay ${cb.txnRef} cho giao dịch đã thu bằng ${p.method}.`,
              },
            });
          }
          return "DUPLICATE_FLAGGED";
        }
        const day = gymClock(new Date()).day;
        const block: GrantBlock | null =
          p.status === "CANCELLED"
            ? {
                code: "PAYMENT_CANCELLED",
                message: "Đơn đã bị hủy trước khi nhận kết quả thanh toán.",
              }
            : await evaluateGrant(
                tx,
                p.membership,
                p.membership.member.user,
                day,
              );
        const grant = allowGrant && !block;
        // BR01: Payment CONFIRMED và Membership ACTIVE/SCHEDULED cùng một transaction.
        if (grant) await grantPaidOrder(tx, p.membership, day);
        await tx.payment.update({
          where: { id: p.id },
          data: {
            status: "CONFIRMED",
            method: "VNPAY",
            confirmedAt: new Date(),
            confirmedById: null,
            vnpTxnRef: cb.txnRef,
            vnpTransactionNo: cb.transactionNo,
            vnpExpiresAt: null,
            benefitStatus: grant ? "GRANTED" : "NEEDS_REVIEW",
            reconciliationStatus: grant ? p.reconciliationStatus : "MISMATCHED",
          },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: grant ? "PAYMENT_VNPAY_CONFIRM" : "PAYMENT_VNPAY_REVIEW",
            entityType: "Payment",
            entityId: p.id,
            changedFields: [
              "status",
              "method",
              "benefitStatus",
              "reconciliationStatus",
              "vnpTxnRef",
            ],
            reason: grant ? null : (forcedReason ?? block?.code ?? "REVIEW"),
          },
        });
        return grant ? "GRANTED" : "REVIEW";
      },
      { timeout: 15000 },
    );
  }

  private applyOnlineFailure(id: string, cb: VnpCallback) {
    return this.db.$transaction(
      async (tx) => {
        const p = await lockPaymentChain(tx, id);
        if (!p) missing();
        // Thông báo thất bại không bao giờ hoàn tác khoản đã thu, và chỉ áp dụng cho lần thử hiện tại.
        if (
          p.status !== "PENDING" ||
          p.method !== "VNPAY" ||
          p.vnpTxnRef !== cb.txnRef
        )
          return;
        await tx.payment.update({
          where: { id: p.id },
          data: {
            status: "FAILED",
            vnpExpiresAt: null,
            vnpTransactionNo: cb.transactionNo,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: p.membership.member.userId,
            action: "PAYMENT_VNPAY_FAILED",
            entityType: "Payment",
            entityId: p.id,
            changedFields: ["status", "vnpTransactionNo"],
            reason: `vnp_ResponseCode=${cb.responseCode}`.slice(0, 100),
          },
        });
      },
      { timeout: 15000 },
    );
  }

  /** Giả lập IPN đã ký đi qua đúng đường xử lý thật; chỉ chạy ở SIMULATED, ngoài production. */
  async simulateVNPay(
    user: CurrentUser,
    id: string,
    result: "SUCCESS" | "FAILED" | "BAD_SIGNATURE",
  ): Promise<{ ipn: IpnResult; payment: PaymentDetailDto }> {
    if (!this.vnpay.simulationAllowed)
      throw new NotFoundException({
        code: "NOT_AVAILABLE",
        message: "Chức năng giả lập VNPay không khả dụng.",
      });
    const p = await this.loadAuthorized(user, id);
    if (!p.vnpTxnRef)
      conflict(
        "VNPAY_NOT_STARTED",
        "Giao dịch chưa tạo yêu cầu thanh toán VNPay.",
      );
    const query = this.vnpay.buildSimulatedCallback({
      txnRef: p.vnpTxnRef,
      amountVnd: Number(p.amount),
      success: result !== "FAILED",
      transactionNo: String(Date.now()).slice(-9),
      now: new Date(),
    });
    if (result === "BAD_SIGNATURE")
      query.vnp_SecureHash =
        (query.vnp_SecureHash[0] === "0" ? "1" : "0") +
        query.vnp_SecureHash.slice(1);
    const ipn = await this.handleVNPayCallback(query);
    return { ipn, payment: await this.dto(id) };
  }

  // ───────────────────────── PAY-04: hóa đơn ─────────────────────────
  async getInvoice(user: CurrentUser, id: string): Promise<InvoiceDto> {
    const p = await this.loadAuthorized(user, id);
    if (!p.invoice)
      throw new NotFoundException({
        code: "INVOICE_NOT_FOUND",
        message: "Chưa có hóa đơn cho giao dịch này.",
      });
    return toInvoiceDto(p.invoice, p);
  }

  async retryInvoice(user: CurrentUser, id: string): Promise<PaymentDetailDto> {
    this.requireAdmin(user);
    const p = await this.load(id);
    if (p.status !== "CONFIRMED")
      conflict(
        "PAYMENT_NOT_CONFIRMED",
        "Chỉ phát hành hóa đơn cho khoản thu đã xác nhận.",
      );
    if (p.invoice?.status === "ISSUED") return toPaymentDto(p);
    await this.invoices.issueForPayment(id);
    await this.db.auditLog.create({
      data: {
        actorId: user.id,
        action: "INVOICE_RETRY",
        entityType: "Payment",
        entityId: id,
        changedFields: ["invoice"],
      },
    });
    return this.dto(id);
  }

  // ───────────────────────── PAY-05: đối soát ─────────────────────────
  async reconcile(
    user: CurrentUser,
    id: string,
    body: ReconcilePaymentRequest,
  ): Promise<PaymentDetailDto> {
    this.requireAdmin(user);
    const note = (body.note ?? "").trim();
    if (body.action === "DISMISS" && note.length < 3)
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Vui lòng nhập ghi chú xử lý.",
        fieldErrors: { note: "Cần ít nhất 3 ký tự." },
      });
    await this.db.$transaction(
      async (tx) => {
        const p = await lockPaymentChain(tx, id);
        if (!p) missing();
        if (
          p.status !== "CONFIRMED" ||
          (p.benefitStatus !== "NEEDS_REVIEW" &&
            p.reconciliationStatus !== "MISMATCHED")
        )
          conflict(
            "NOTHING_TO_RECONCILE",
            "Giao dịch này không có mục cần đối soát.",
          );
        const day = gymClock(new Date()).day;
        let benefit = p.benefitStatus;
        if (body.action === "GRANT") {
          if (p.benefitStatus !== "NEEDS_REVIEW")
            conflict(
              "NO_BENEFIT_TO_GRANT",
              "Giao dịch đã được cấp quyền lợi, không cần cấp bổ sung.",
            );
          const block = await evaluateGrant(
            tx,
            p.membership,
            p.membership.member.user,
            day,
          );
          if (block) conflict(block.code, block.message);
          await grantPaidOrder(tx, p.membership, day);
          benefit = "GRANTED";
        } else if (p.benefitStatus === "NEEDS_REVIEW") {
          // Đã xử lý ngoài hệ thống (ví dụ hoàn tiền): không cấp, đóng đăng ký chờ.
          benefit = "NONE";
          if (p.membership.status === "PENDING_PAYMENT")
            await tx.membership.update({
              where: { id: p.membershipId },
              data: { status: "CANCELLED", version: { increment: 1 } },
            });
        }
        await tx.payment.update({
          where: { id },
          data: { benefitStatus: benefit, reconciliationStatus: "RECONCILED" },
        });
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: "PAYMENT_RECONCILE",
            entityType: "Payment",
            entityId: id,
            changedFields: ["benefitStatus", "reconciliationStatus"],
            reason: `${body.action}${note ? `: ${note}` : ""}`.slice(0, 1000),
          },
        });
      },
      { timeout: 15000 },
    );
    await this.invoices.issueForPayment(id); // idempotent, không ném lỗi
    return this.dto(id);
  }

  // ───────────────────────── Mobile: khoản của tôi ─────────────────────────
  async myPayments(user: CurrentUser): Promise<MyPaymentDto[]> {
    if (user.role !== "MEMBER")
      throw new ForbiddenException({
        code: "ROLE_FORBIDDEN",
        message: "Chỉ hội viên xem được khoản thanh toán của mình.",
      });
    const rows = await this.db.payment.findMany({
      where: { membership: { member: { userId: user.id } } },
      include: includePayment,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
    });
    return rows.map(toMyPaymentDto);
  }
}
