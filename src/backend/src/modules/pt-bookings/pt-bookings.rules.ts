// Quy tac thuan (khong cham DB) cua UC08, de test chinh xac cac moc 12h / 6h.
export const MEMBER_FREE_CANCEL_HOURS = 12; // BR04: huy truoc >= 12h thi duoc hoan buoi.
export const PT_COMPENSATION_HOURS = 6; // BR04: PT huy < 6h thi den bu them 1 buoi.
const HOUR_MS = 3600_000;

export type PtSessionOutcome = "REFUND" | "CONSUME" | "REFUND_WITH_COMPENSATION";

export function hoursBeforeStart(startTime: Date, now: Date): number {
  return (startTime.getTime() - now.getTime()) / HOUR_MS;
}

/** A1: hoi vien huy. Dung moc 12h: >= 12h hoan, < 12h tru han. */
export function memberCancelOutcome(startTime: Date, now: Date): PtSessionOutcome {
  return hoursBeforeStart(startTime, now) >= MEMBER_FREE_CANCEL_HOURS ? "REFUND" : "CONSUME";
}

/** A2: PT huy. Luon hoan 1 buoi; < 6h thi cong them 1 buoi den bu. */
export function ptCancelOutcome(startTime: Date, now: Date): PtSessionOutcome {
  return hoursBeforeStart(startTime, now) >= PT_COMPENSATION_HOURS
    ? "REFUND"
    : "REFUND_WITH_COMPENSATION";
}

/** A3: chi xac minh NO_SHOW khi ca da ket thuc (now >= endTime). */
export function canVerifyNoShow(endTime: Date, now: Date): boolean {
  return now.getTime() >= endTime.getTime();
}

/** Hai khoang [start, end) cua hai lich cua cung hoi vien co chong nhau khong. */
export function overlaps(a: { startTime: Date; endTime: Date }, b: { startTime: Date; endTime: Date }) {
  return a.startTime < b.endTime && b.startTime < a.endTime;
}
