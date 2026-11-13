import type {
  NotificationTargetScreen,
  NotificationType,
  ReminderType,
} from "@fithub/contracts";

/**
 * Pure scheduling rules for UC16 so they can be unit tested without a database.
 *
 * BR01: PT appointment reminders fire 24h and 2h before the slot starts.
 * BR02: package expiry reminders fire 7 and 3 days before the package ends.
 */
const HOUR = 3600_000;
export const PT_OFFSETS: { type: ReminderType; ms: number }[] = [
  { type: "PT_REMINDER_24H", ms: 24 * HOUR },
  { type: "PT_REMINDER_2H", ms: 2 * HOUR },
];
export const PACKAGE_OFFSETS: { type: ReminderType; days: number }[] = [
  { type: "PACKAGE_EXPIRY_7D", days: 7 },
  { type: "PACKAGE_EXPIRY_3D", days: 3 },
];
// Package reminders go out at 08:00 gym time (UTC+7), a sensible hour to read them.
const EXPIRY_HOUR_LOCAL = "08:00:00+07:00";

export const isPtReminder = (type: ReminderType) => type.startsWith("PT_");

/** Reminder times for one appointment. Moments already in the past are not created. */
export function appointmentReminderTimes(startTime: Date, now: Date) {
  return PT_OFFSETS.map((o) => ({
    type: o.type,
    scheduledAt: new Date(startTime.getTime() - o.ms),
  })).filter((r) => r.scheduledAt.getTime() > now.getTime());
}

/** The appointment start implied by a PT reminder and the time it was scheduled for. */
export function appointmentStartFromReminder(type: ReminderType, scheduledAt: Date) {
  const offset = PT_OFFSETS.find((o) => o.type === type);
  return new Date(scheduledAt.getTime() + (offset?.ms ?? 0));
}

function shiftDate(date: string, days: number) {
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

/** When a given package-expiry reminder is due for a membership that ends on `endsBefore`. */
export function expiryReminderAt(type: ReminderType, endsBefore: Date) {
  const offset = PACKAGE_OFFSETS.find((o) => o.type === type);
  if (!offset) throw new Error(`Not a package reminder: ${type}`);
  const day = shiftDate(endsBefore.toISOString().slice(0, 10), -offset.days);
  return new Date(`${day}T${EXPIRY_HOUR_LOCAL}`);
}

/** Reminder times for one membership. Moments already in the past are not created. */
export function expiryReminderTimes(endsBefore: Date, now: Date) {
  return PACKAGE_OFFSETS.map((o) => ({
    type: o.type,
    scheduledAt: expiryReminderAt(o.type, endsBefore),
  })).filter((r) => r.scheduledAt.getTime() > now.getTime());
}

const vnTime = (d: Date) =>
  new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour12: false,
  }).format(d);
const vnDate = (d: Date) =>
  new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);

export interface NotificationContent {
  type: NotificationType;
  title: string;
  body: string;
  targetScreen: NotificationTargetScreen;
}

export function buildContent(
  reminderType: ReminderType,
  ctx: { startsAt?: Date; endsBefore?: Date; packageName?: string },
): NotificationContent {
  switch (reminderType) {
    case "PT_REMINDER_24H":
      return {
        type: "PT_REMINDER",
        title: "Nhắc lịch tập PT ngày mai",
        body: `Bạn có buổi tập với PT lúc ${vnTime(ctx.startsAt!)}. Còn khoảng 24 giờ nữa.`,
        targetScreen: "PT_APPOINTMENTS",
      };
    case "PT_REMINDER_2H":
      return {
        type: "PT_REMINDER",
        title: "Sắp đến giờ tập với PT",
        body: `Buổi tập với PT bắt đầu lúc ${vnTime(ctx.startsAt!)}, còn khoảng 2 giờ nữa.`,
        targetScreen: "PT_APPOINTMENTS",
      };
    default: {
      const days = reminderType === "PACKAGE_EXPIRY_7D" ? 7 : 3;
      // endsBefore is exclusive, so the last day of the package is the day before.
      const last = new Date(ctx.endsBefore!.getTime() - 24 * HOUR);
      return {
        type: "PACKAGE_EXPIRY",
        title: `Gói tập sắp hết hạn (${days} ngày)`,
        body: `Gói ${ctx.packageName ?? "tập"} của bạn còn dùng đến hết ngày ${vnDate(last)}. Hãy gia hạn để không bị gián đoạn.`,
        targetScreen: "MY_PACKAGE",
      };
    }
  }
}
