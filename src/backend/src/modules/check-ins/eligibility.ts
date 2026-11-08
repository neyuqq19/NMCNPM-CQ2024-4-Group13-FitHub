import type { Membership, Payment } from "@prisma/client";

export type PurchasedMembership = Membership & { payment: Payment | null };
export const COOLDOWN_MS = 10 * 60 * 1000;
export function gymClock(now: Date) {
  const local = new Date(now.getTime() + 7 * 3600 * 1000);
  return {
    day: local.toISOString().slice(0, 10),
    minute: local.getUTCHours() * 60 + local.getUTCMinutes(),
  };
}
export function eligibleMembership(list: PurchasedMembership[], now: Date) {
  const { day, minute } = gymClock(now);
  const current = list.filter(
    (m) =>
      m.startsOn.toISOString().slice(0, 10) <= day &&
      day < m.endsBefore.toISOString().slice(0, 10),
  );
  const paid = current.filter(
    (m) =>
      ["ACTIVE", "SCHEDULED"].includes(m.status) &&
      m.payment?.status === "CONFIRMED" &&
      m.grantsGymAccessSnapshot,
  );
  const allowed = paid.filter((m) =>
    m.accessWindowSnapshot === "OFF_PEAK"
      ? minute >= 540 && minute < 960
      : minute >= 330 && minute < 1320,
  );
  allowed.sort(
    (a, b) =>
      a.endsBefore.getTime() - b.endsBefore.getTime() ||
      a.id.localeCompare(b.id),
  );
  if (allowed[0])
    return {
      membership: allowed[0],
      code: "ELIGIBLE",
      message: "Đủ điều kiện vào tập.",
    };
  if (paid.length)
    return {
      code: "OUTSIDE_HOURS",
      message:
        "Ngoài giờ sử dụng gói tập. Giờ thường: 05:30–22:00; thấp điểm: 09:00–16:00.",
    };
  if (current.some((m) => m.status === "FROZEN"))
    return { code: "MEMBERSHIP_FROZEN", message: "Gói tập đang bảo lưu." };
  if (current.some((m) => m.status === "PENDING_PAYMENT"))
    return {
      code: "PAYMENT_PENDING",
      message: "Gói tập chưa được xác nhận thanh toán.",
    };
  if (current.some((m) => !m.grantsGymAccessSnapshot))
    return {
      code: "NO_GYM_ACCESS",
      message: "Gói tập không có quyền vào gym.",
    };
  if (
    list.some(
      (m) =>
        ["ACTIVE", "SCHEDULED"].includes(m.status) &&
        m.startsOn.toISOString().slice(0, 10) > day,
    )
  )
    return {
      code: "MEMBERSHIP_SCHEDULED",
      message: "Gói tập chưa đến ngày sử dụng.",
    };
  if (
    list.some(
      (m) =>
        m.endsBefore.toISOString().slice(0, 10) <= day ||
        m.status === "EXPIRED",
    )
  )
    return {
      code: "MEMBERSHIP_EXPIRED",
      message: "Gói tập đã hết hạn. Vui lòng liên hệ quầy lễ tân.",
    };
  if (list.some((m) => m.status === "CANCELLED"))
    return { code: "MEMBERSHIP_CANCELLED", message: "Gói tập đã bị hủy." };
  return {
    code: "NO_MEMBERSHIP",
    message: "Bạn chưa có gói tập đủ điều kiện. Vui lòng liên hệ quầy lễ tân.",
  };
}
