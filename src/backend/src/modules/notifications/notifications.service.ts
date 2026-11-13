import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Notification, Prisma, Reminder } from "@prisma/client";
import type {
  CurrentUser,
  DispatchDueRequest,
  DispatchDueResult,
  MarkAllReadResponse,
  NotificationDto,
  NotificationListResponse,
  NotificationReadResponse,
  NotificationTargetScreen,
  NotificationType,
  PushDeviceDto,
  RegisterPushDeviceRequest,
} from "@fithub/contracts";
import { PrismaService } from "../../database/prisma.service";
import { APPOINTMENT_SOURCE, type AppointmentSource } from "./appointment-source";
import { PUSH_ADAPTER, type PushAdapter } from "./push.adapter";
import {
  appointmentReminderTimes,
  appointmentStartFromReminder,
  buildContent,
  expiryReminderAt,
  expiryReminderTimes,
} from "./notifications.rules";

const fail = (code: string, message: string) =>
  new BadRequestException({ code, message });
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const todayVN = (now: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

type Verdict =
  | { kind: "send"; startsAt?: Date; endsBefore?: Date; packageName?: string }
  | { kind: "cancel" } // source is gone or no longer valid (BR03)
  | { kind: "skip" } // not worth sending any more (stale or renewed)
  | { kind: "defer" } // paused, e.g. membership FROZEN (A2)
  | { kind: "reschedule"; scheduledAt: Date };

function toDto(n: Notification): NotificationDto {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    targetScreen: n.targetScreen as NotificationTargetScreen,
    sourceId: n.sourceId,
    isRead: n.isRead,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  };
}

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PUSH_ADAPTER) private readonly push: PushAdapter,
    @Inject(APPOINTMENT_SOURCE) private readonly appointments: AppointmentSource,
  ) {}

  // ---------------------------------------------------------------- NTF-01 / NTF-02

  /** SR01: always scoped to the signed-in user. */
  async listMine(
    user: CurrentUser,
    query: Record<string, string> = {},
  ): Promise<NotificationListResponse> {
    const type = query.type;
    if (type !== undefined && type !== "PT_REMINDER" && type !== "PACKAGE_EXPIRY")
      throw fail("INVALID_FILTER", "Loại thông báo chỉ nhận PT_REMINDER hoặc PACKAGE_EXPIRY.");
    const page = query.page === undefined ? 1 : Number(query.page);
    const pageSize = query.pageSize === undefined ? 20 : Number(query.pageSize);
    if (!Number.isInteger(page) || page < 1)
      throw fail("INVALID_PAGE", "Trang phải là số nguyên từ 1.");
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50)
      throw fail("INVALID_PAGE_SIZE", "Số dòng mỗi trang từ 1 đến 50.");
    const where: Prisma.NotificationWhereInput = {
      recipientId: user.id,
      ...(type ? { type: type as NotificationType } : {}),
      ...(query.unreadOnly === "true" ? { isRead: false } : {}),
    };
    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where }),
      this.unread(user.id),
    ]);
    return { items: items.map(toDto), unreadCount, total, page, pageSize };
  }

  async markRead(user: CurrentUser, id: string): Promise<NotificationReadResponse> {
    const row = await this.prisma.notification.findUnique({ where: { id } });
    if (!row)
      throw new NotFoundException({ code: "NOTIFICATION_NOT_FOUND", message: "Không tìm thấy thông báo." });
    if (row.recipientId !== user.id)
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Bạn chỉ được xem thông báo của chính mình.",
      });
    const notification = row.isRead
      ? row
      : await this.prisma.notification.update({
          where: { id },
          data: { isRead: true, readAt: new Date() },
        });
    return { notification: toDto(notification), unreadCount: await this.unread(user.id) };
  }

  async markAllRead(user: CurrentUser): Promise<MarkAllReadResponse> {
    const { count } = await this.prisma.notification.updateMany({
      where: { recipientId: user.id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { updated: count, unreadCount: await this.unread(user.id) };
  }

  private unread(recipientId: string) {
    return this.prisma.notification.count({ where: { recipientId, isRead: false } });
  }

  // ---------------------------------------------------------------- NTF-05

  async registerDevice(
    user: CurrentUser,
    body: Partial<RegisterPushDeviceRequest> | undefined,
  ): Promise<PushDeviceDto> {
    if (user.role === "ADMIN")
      throw new ForbiddenException({
        code: "ROLE_FORBIDDEN",
        message: "Chỉ hội viên và huấn luyện viên được đăng ký thiết bị nhận thông báo.",
      });
    const { deviceId, platform, pushToken } = body ?? {};
    if (typeof deviceId !== "string" || !deviceId.trim() || deviceId.length > 128)
      throw fail("INVALID_DEVICE", "Mã thiết bị là chuỗi từ 1 đến 128 ký tự.");
    if (platform !== "WEB" && platform !== "MOBILE")
      throw fail("INVALID_PLATFORM", "Nền tảng chỉ nhận WEB hoặc MOBILE.");
    if (typeof pushToken !== "string" || !pushToken.trim() || pushToken.length > 4096)
      throw fail("INVALID_PUSH_TOKEN", "Push token là chuỗi từ 1 đến 4096 ký tự.");
    if (body?.enabled !== undefined && typeof body.enabled !== "boolean")
      throw fail("INVALID_ENABLED", "enabled phải là true hoặc false.");
    const enabled = body?.enabled ?? true;
    const row = await this.prisma.pushDevice.upsert({
      where: { userId_deviceId: { userId: user.id, deviceId: deviceId.trim() } },
      create: { userId: user.id, deviceId: deviceId.trim(), platform, pushToken, enabled },
      update: { platform, pushToken, enabled },
    });
    return { id: row.id, deviceId: row.deviceId, platform: row.platform, enabled: row.enabled };
  }

  // ---------------------------------------------------------------- NTF-03 (called by UC05 / UC08)

  /** BR01: reminders 24h and 2h before an appointment, for the member and the PT. */
  async scheduleAppointmentReminders(input: {
    appointmentId: string;
    startTime: Date;
    memberUserId: string;
    trainerUserId?: string | null;
    now?: Date;
  }) {
    const now = input.now ?? new Date();
    const recipients = [input.memberUserId, input.trainerUserId].filter(
      (id): id is string => !!id,
    );
    let scheduled = 0;
    for (const recipientId of new Set(recipients))
      for (const r of appointmentReminderTimes(input.startTime, now))
        if (await this.upsertReminder(recipientId, "APPOINTMENT", input.appointmentId, r.type, r.scheduledAt))
          scheduled++;
    return { scheduled };
  }

  /** BR02: reminders 7 and 3 days before a membership ends. */
  async scheduleMembershipExpiryReminders(membershipId: string, now = new Date()) {
    const m = await this.prisma.membership.findUnique({
      where: { id: membershipId },
      include: { member: { select: { userId: true } } },
    });
    if (!m) throw new NotFoundException({ code: "MEMBERSHIP_NOT_FOUND", message: "Không tìm thấy gói tập." });
    if (!["ACTIVE", "SCHEDULED", "FROZEN"].includes(m.status)) {
      await this.cancelRemindersBySource("MEMBERSHIP", membershipId);
      return { scheduled: 0 };
    }
    return { scheduled: await this.applyExpiry(m.member.userId, membershipId, m.endsBefore, now) };
  }

  /**
   * A2: while a membership is FROZEN no expiry reminder goes out (the dispatcher defers
   * them). When the freeze moves the end date, pass it in and the pending reminders shift.
   */
  async pauseRemindersOnFreeze(membershipId: string, newEndsBefore?: Date, now = new Date()) {
    if (!newEndsBefore) return { rescheduled: 0 };
    const m = await this.prisma.membership.findUnique({
      where: { id: membershipId },
      include: { member: { select: { userId: true } } },
    });
    if (!m) throw new NotFoundException({ code: "MEMBERSHIP_NOT_FOUND", message: "Không tìm thấy gói tập." });
    return { rescheduled: await this.applyExpiry(m.member.userId, membershipId, newEndsBefore, now) };
  }

  /** Cancel what has not been sent yet, e.g. when an appointment is cancelled. */
  async cancelRemindersBySource(sourceType: "APPOINTMENT" | "MEMBERSHIP", sourceId: string) {
    const { count } = await this.prisma.reminder.updateMany({
      where: { sourceType, sourceId, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    return { cancelled: count };
  }

  private async applyExpiry(recipientId: string, membershipId: string, endsBefore: Date, now: Date) {
    let n = 0;
    for (const r of expiryReminderTimes(endsBefore, now))
      if (await this.upsertReminder(recipientId, "MEMBERSHIP", membershipId, r.type, r.scheduledAt)) n++;
    return n;
  }

  /** Creates the reminder, or moves a not-yet-sent one. A sent reminder is never re-armed. */
  private async upsertReminder(
    recipientId: string,
    sourceType: "APPOINTMENT" | "MEMBERSHIP",
    sourceId: string,
    reminderType: Reminder["reminderType"],
    scheduledAt: Date,
  ) {
    const key = { sourceType, sourceId, reminderType, recipientId };
    const existing = await this.prisma.reminder.findUnique({
      where: { sourceType_sourceId_reminderType_recipientId: key },
    });
    if (!existing) {
      await this.prisma.reminder.create({ data: { ...key, scheduledAt } });
      return true;
    }
    if (existing.status === "SENT") return false;
    await this.prisma.reminder.update({
      where: { id: existing.id },
      data: { scheduledAt, status: "PENDING" },
    });
    return true;
  }

  // ---------------------------------------------------------------- NTF-04

  async dispatchDue(user: CurrentUser, body: DispatchDueRequest | undefined) {
    if (user.role !== "ADMIN")
      throw new ForbiddenException({
        code: "ROLE_FORBIDDEN",
        message: "Chỉ quản trị viên được kích hoạt quét lịch nhắc.",
      });
    let now: Date | undefined;
    if (body?.now !== undefined) {
      now = new Date(body.now);
      if (typeof body.now !== "string" || Number.isNaN(now.getTime()))
        throw fail("INVALID_NOW", "now phải là thời điểm ISO hợp lệ.");
    }
    if (body?.simulatePushFailure !== undefined && typeof body.simulatePushFailure !== "boolean")
      throw fail("INVALID_SIMULATE", "simulatePushFailure phải là true hoặc false.");
    return this.processDueReminders({ now, simulatePushFailure: body?.simulatePushFailure });
  }

  /** BR03 + BR04: check the source, store the inbox row first, then try the push. */
  async processDueReminders(
    options: { now?: Date; simulatePushFailure?: boolean } = {},
  ): Promise<DispatchDueResult> {
    const now = options.now ?? new Date();
    const due = await this.prisma.reminder.findMany({
      where: { status: "PENDING", scheduledAt: { lte: now } },
      orderBy: { scheduledAt: "asc" },
      take: 500,
    });
    const result: DispatchDueResult = {
      due: due.length, sent: 0, cancelled: 0, skipped: 0, deferred: 0, pushSent: 0, pushFailed: 0,
    };
    for (const reminder of due) {
      const verdict = await this.judge(reminder, now);
      if (verdict.kind === "defer") result.deferred++;
      else if (verdict.kind === "reschedule") {
        await this.prisma.reminder.updateMany({
          where: { id: reminder.id, status: "PENDING" },
          data: { scheduledAt: verdict.scheduledAt },
        });
        result.deferred++;
      } else if (verdict.kind === "cancel" || verdict.kind === "skip") {
        const { count } = await this.prisma.reminder.updateMany({
          where: { id: reminder.id, status: "PENDING" },
          data: { status: verdict.kind === "cancel" ? "CANCELLED" : "SKIPPED" },
        });
        if (count) result[verdict.kind === "cancel" ? "cancelled" : "skipped"]++;
      } else {
        const content = buildContent(reminder.reminderType, {
          startsAt: verdict.startsAt,
          endsBefore: verdict.endsBefore,
          packageName: verdict.packageName,
        });
        // The inbox row is created first and stays whatever happens to the push (BR04).
        const notification = await this.prisma.$transaction(async (tx) => {
          const claimed = await tx.reminder.updateMany({
            where: { id: reminder.id, status: "PENDING" },
            data: { status: "SENT", sentAt: now },
          });
          // Another dispatcher run took it first: never send twice.
          if (claimed.count === 0) return null;
          return tx.notification.create({
            data: {
              recipientId: reminder.recipientId,
              reminderId: reminder.id,
              type: content.type,
              title: content.title,
              body: content.body,
              targetScreen: content.targetScreen,
              sourceId: reminder.sourceId,
            },
          });
        });
        if (!notification) continue;
        result.sent++;
        const pushed = await this.deliverPush(notification, options.simulatePushFailure);
        result.pushSent += pushed.sent;
        result.pushFailed += pushed.failed;
      }
    }
    return result;
  }

  /** BR03: is the thing this reminder is about still true? */
  private async judge(reminder: Reminder, now: Date): Promise<Verdict> {
    if (reminder.sourceType === "APPOINTMENT") {
      if (!(await this.appointments.isConfirmed(reminder.sourceId))) return { kind: "cancel" };
      const startsAt = appointmentStartFromReminder(reminder.reminderType, reminder.scheduledAt);
      // The session already started, a reminder now would only be noise.
      if (startsAt.getTime() <= now.getTime()) return { kind: "skip" };
      return { kind: "send", startsAt };
    }
    const m = await this.prisma.membership.findUnique({ where: { id: reminder.sourceId } });
    if (!m) return { kind: "cancel" };
    if (m.status === "FROZEN") return { kind: "defer" }; // A2
    if (m.status !== "ACTIVE") return { kind: "cancel" };
    if (ymd(m.endsBefore) <= todayVN(now)) return { kind: "cancel" }; // already ended
    // A1: the member already renewed, no need to nag.
    const renewal = await this.prisma.membership.findFirst({
      where: {
        memberId: m.memberId,
        id: { not: m.id },
        status: { in: ["SCHEDULED", "ACTIVE"] },
        startsOn: { gte: m.endsBefore },
      },
      select: { id: true },
    });
    if (renewal) return { kind: "skip" };
    // The end date moved since scheduling (freeze / extension): follow it.
    const expected = expiryReminderAt(reminder.reminderType, m.endsBefore);
    if (expected.getTime() !== reminder.scheduledAt.getTime())
      return expected.getTime() > now.getTime()
        ? { kind: "reschedule", scheduledAt: expected }
        : { kind: "skip" };
    return { kind: "send", endsBefore: m.endsBefore, packageName: m.packageNameSnapshot };
  }

  /** Push is best effort. A failure is recorded as a FAILED DeliveryAttempt, never thrown (E1). */
  private async deliverPush(notification: Notification, simulateFailure?: boolean) {
    const out = { sent: 0, failed: 0 };
    const record = (status: "SENT" | "FAILED", errorMessage?: string) =>
      this.prisma.deliveryAttempt
        .create({
          data: { notificationId: notification.id, channel: "PUSH", status, errorMessage: errorMessage ?? null },
        })
        .catch(() => undefined);
    try {
      const devices = await this.prisma.pushDevice.findMany({
        where: { userId: notification.recipientId, enabled: true },
      });
      if (devices.length === 0) {
        out.failed++;
        await record("FAILED", "Người dùng chưa đăng ký thiết bị hoặc đã tắt thông báo đẩy.");
        return out;
      }
      for (const device of devices) {
        try {
          await this.push.sendPush(
            {
              token: device.pushToken,
              title: notification.title,
              body: notification.body,
              data: { notificationId: notification.id, targetScreen: notification.targetScreen },
            },
            { simulateFailure },
          );
          out.sent++;
          await record("SENT");
        } catch (error) {
          out.failed++;
          await record("FAILED", error instanceof Error ? error.message : "Lỗi gửi thông báo đẩy.");
        }
      }
    } catch {
      // Even the device lookup failing must not take the inbox row down.
      out.failed++;
    }
    return out;
  }
}
