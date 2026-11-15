import type { Prisma } from "@prisma/client";
import { includePayment, type PaymentRow } from "./payment.mapper";

/**
 * Quy tắc cấp quyền lợi sau khi thu tiền (BR01) dùng chung cho thu tại quầy,
 * IPN VNPay và đối soát. Mọi hàm nhận `tx` để chạy trong cùng một transaction.
 */
export interface GrantBlock {
  code: string;
  message: string;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Khóa theo thứ tự cố định User → MemberProfile → Membership → Payment (tránh deadlock). */
export async function lockPaymentChain(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<PaymentRow | null> {
  const found = await tx.payment.findUnique({
    where: { id },
    include: includePayment,
  });
  if (!found) return null;
  const m = found.membership;
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${m.member.userId}::uuid FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "MemberProfile" WHERE "id"=${m.memberId}::uuid FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "Membership" WHERE "id"=${m.id}::uuid FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id"=${id}::uuid FOR UPDATE`;
  return tx.payment.findUniqueOrThrow({ where: { id }, include: includePayment });
}

/** Gói đang bảo lưu hoặc trùng kỳ với gói khác chặn việc đăng ký/kích hoạt. */
export async function findOverlapBlock(
  tx: Prisma.TransactionClient,
  memberId: string,
  start: Date,
  end: Date,
  except?: string,
): Promise<GrantBlock | null> {
  const frozen = await tx.membership.findFirst({
    where: { memberId, status: "FROZEN", grantsGymAccessSnapshot: true },
  });
  if (frozen)
    return {
      code: "MEMBERSHIP_FROZEN",
      message: "Cần xử lý gói đang bảo lưu trước khi đăng ký hoặc gia hạn.",
    };
  const overlap = await tx.membership.findFirst({
    where: {
      memberId,
      ...(except ? { id: { not: except } } : {}),
      grantsGymAccessSnapshot: true,
      status: { in: ["PENDING_PAYMENT", "ACTIVE", "SCHEDULED", "FROZEN"] },
      startsOn: { lt: end },
      endsBefore: { gt: start },
    },
  });
  return overlap
    ? {
        code: "MEMBERSHIP_OVERLAP",
        message:
          "Thời hạn trùng với gói đã đăng ký hoặc đang chờ thanh toán. Chọn ngày bắt đầu sau kỳ hiện tại hoặc xử lý khoản chờ trước.",
      }
    : null;
}

export interface GrantTarget {
  id: string;
  memberId: string;
  status: string;
  startsOn: Date;
  endsBefore: Date;
  grantsGymAccessSnapshot: boolean;
}

/** Trả lý do không thể cấp quyền lợi (null nếu cấp được). Không ghi dữ liệu. */
export async function evaluateGrant(
  tx: Prisma.TransactionClient,
  m: GrantTarget,
  user: { status: string; verifiedAt: Date | null },
  day: string,
): Promise<GrantBlock | null> {
  if (user.status !== "ACTIVE" || !user.verifiedAt)
    return {
      code: "MEMBER_NOT_ELIGIBLE",
      message:
        "Hội viên phải xác minh và có tài khoản đang hoạt động để đăng ký hoặc thanh toán.",
    };
  if (m.status !== "PENDING_PAYMENT")
    return {
      code: "MEMBERSHIP_NOT_PENDING",
      message: "Đăng ký không còn ở trạng thái chờ thanh toán.",
    };
  if (ymd(m.endsBefore) <= day)
    return {
      code: "ORDER_EXPIRED",
      message:
        "Thời hạn dự kiến của đăng ký đã kết thúc. Hủy và tạo đăng ký mới.",
    };
  if (!m.grantsGymAccessSnapshot) return null;
  if (ymd(m.startsOn) > day) {
    const scheduled = await tx.membership.findFirst({
      where: {
        id: { not: m.id },
        memberId: m.memberId,
        grantsGymAccessSnapshot: true,
        status: "SCHEDULED",
      },
    });
    if (scheduled)
      return {
        code: "SCHEDULED_LIMIT_REACHED",
        message: "Hội viên đã có 1 gói gia hạn chờ kích hoạt (SCHEDULED).",
      };
  }
  return findOverlapBlock(tx, m.memberId, m.startsOn, m.endsBefore, m.id);
}

/**
 * grantPaidOrder (SAD 4.3): PENDING_PAYMENT → ACTIVE (startsOn ≤ hôm nay) hoặc
 * SCHEDULED. Gọi trong cùng transaction với việc xác nhận Payment. Số buổi PT
 * đã được snapshot vào ptSessionsRemaining khi đăng ký nên không cộng thêm ở đây.
 */
export async function grantPaidOrder(
  tx: Prisma.TransactionClient,
  m: Pick<GrantTarget, "id" | "startsOn">,
  day: string,
): Promise<"ACTIVE" | "SCHEDULED"> {
  const status = ymd(m.startsOn) > day ? "SCHEDULED" : "ACTIVE";
  await tx.membership.update({
    where: { id: m.id },
    data: { status, version: { increment: 1 } },
  });
  return status;
}
