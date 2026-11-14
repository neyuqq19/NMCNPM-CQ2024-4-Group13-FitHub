import type { Prisma, Invoice } from "@prisma/client";
import type {
  BenefitStatus,
  InvoiceDto,
  MyPaymentDto,
  PaymentDetailDto,
  ReconciliationStatus,
} from "@fithub/contracts";

export const includePayment = {
  membership: { include: { member: { include: { user: true } } } },
  confirmedBy: true,
  invoice: true,
} satisfies Prisma.PaymentInclude;
export type PaymentRow = Prisma.PaymentGetPayload<{
  include: typeof includePayment;
}>;

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const vn = (iso: string) => iso.split("-").reverse().join("/");
const METHOD_LABEL: Record<string, string> = {
  CASH: "Tiền mặt",
  BANK_TRANSFER: "Chuyển khoản",
  VNPAY: "VNPay",
};

/** Hạn của URL VNPay còn hiệu lực; null khi không còn chờ thanh toán trực tuyến. */
function onlineExpiresAt(p: PaymentRow, now = new Date()): string | null {
  return p.status === "PENDING" &&
    p.method === "VNPAY" &&
    p.vnpExpiresAt &&
    p.vnpExpiresAt > now
    ? p.vnpExpiresAt.toISOString()
    : null;
}

export function toInvoiceDto(
  inv: Invoice,
  p: PaymentRow,
): InvoiceDto {
  const m = p.membership;
  const lastDay = ymd(new Date(m.endsBefore.getTime() - 86400000));
  return {
    id: inv.id,
    // Hóa đơn lỗi vẫn giữ mã đã dành sẵn trong DB (cột code bắt buộc) nhưng chưa công bố.
    code: inv.status === "ISSUED" ? inv.code : null,
    status: inv.status === "ISSUED" ? "ISSUED" : "FAILED",
    issuedAt: inv.status === "ISSUED" ? inv.issuedAt.toISOString() : null,
    errorMessage: inv.errorMessage,
    pdfUrl: inv.pdfUrl,
    receipt:
      inv.status === "ISSUED" && p.confirmedAt
        ? {
            buyerName: m.member.user.displayName,
            memberCode: m.member.memberCode,
            packageName: m.packageNameSnapshot,
            period: `${vn(ymd(m.startsOn))} – ${vn(lastDay)}`,
            amount: Number(p.amount),
            method: METHOD_LABEL[p.method] ?? p.method,
            paidAt: p.confirmedAt.toISOString(),
            cashier: p.confirmedBy?.displayName ?? null,
            paymentCode: p.code,
          }
        : null,
  };
}

export function toPaymentDto(p: PaymentRow): PaymentDetailDto {
  const m = p.membership,
    u = m.member.user;
  return {
    id: p.id,
    code: p.code,
    status: p.status,
    amount: Number(p.amount),
    method: p.method,
    createdAt: p.createdAt.toISOString(),
    confirmedAt: p.confirmedAt?.toISOString() || null,
    confirmedBy: p.confirmedBy?.displayName || null,
    isTest: p.code.startsWith("GD-TESTQR-") || m.code.startsWith("TESTQR-"),
    benefitStatus: p.benefitStatus as BenefitStatus,
    reconciliationStatus: p.reconciliationStatus as ReconciliationStatus,
    transferReference: p.transferReference,
    onlineExpiresAt: onlineExpiresAt(p),
    invoice: p.invoice ? toInvoiceDto(p.invoice, p) : null,
    member: {
      id: m.memberId,
      memberCode: m.member.memberCode,
      displayName: u.displayName,
      accountStatus: u.status,
    },
    membership: {
      id: m.id,
      code: m.code,
      packageName: m.packageNameSnapshot,
      status: m.status,
      startsOn: ymd(m.startsOn),
      endsBefore: ymd(m.endsBefore),
      accessWindow: m.accessWindowSnapshot,
      grantsGymAccess: m.grantsGymAccessSnapshot,
    },
  };
}

export function toMyPaymentDto(p: PaymentRow): MyPaymentDto {
  return {
    id: p.id,
    code: p.code,
    status: p.status,
    amount: Number(p.amount),
    method: p.method,
    createdAt: p.createdAt.toISOString(),
    confirmedAt: p.confirmedAt?.toISOString() || null,
    onlineExpiresAt: onlineExpiresAt(p),
    packageName: p.membership.packageNameSnapshot,
    membershipStatus: p.membership.status,
    startsOn: ymd(p.membership.startsOn),
    endsBefore: ymd(p.membership.endsBefore),
    benefitStatus: p.benefitStatus as BenefitStatus,
    invoice: p.invoice ? toInvoiceDto(p.invoice, p) : null,
  };
}
