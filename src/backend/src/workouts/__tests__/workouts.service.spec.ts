// SCRUM-108 — unit test cho WorkoutsService (UC13) và NotificationsService (UC16).
// Prisma, AuthService và push adapter đều được giả lập: không cần database.
import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mock, test } from "node:test";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { Notification, Reminder } from "@prisma/client";
import type { CurrentUser } from "@fithub/contracts";
import type { PrismaService } from "../../database/prisma.service";
import type { AuthService } from "../../modules/auth/auth.service";
import { WorkoutsService } from "../../modules/workouts/workouts.service";
import { NotificationsService } from "../../modules/notifications/notifications.service";
import type { PushAdapter } from "../../modules/notifications/push.adapter";
import type { AppointmentSource } from "../../modules/notifications/appointment-source";

const user = (role: CurrentUser["role"], id = randomUUID()): CurrentUser => ({
  id,
  displayName: "Người dùng kiểm thử",
  email: null,
  phone: null,
  role,
});

const code = (error: unknown) =>
  (error as { getResponse(): { code: string } }).getResponse().code;

function workoutsFixture(role: CurrentUser["role"], memberId = randomUUID()) {
  const tx = {
    $queryRaw: mock.fn(async () => []),
    workoutSession: {
      findUnique: mock.fn(async (_query: unknown): Promise<unknown> => null),
      delete: mock.fn(),
    },
  };
  const db = {
    memberProfile: { findUnique: mock.fn(async () => ({ id: memberId })) },
    workoutSession: { count: mock.fn(), findMany: mock.fn() },
    $transaction: mock.fn((run: (t: typeof tx) => unknown) => run(tx)),
  };
  const auth = { validateSession: mock.fn(async () => user(role)) };
  const service = new WorkoutsService(
    db as unknown as PrismaService,
    auth as unknown as AuthService,
  );
  return { service, db, tx };
}

test("UC13 — tài khoản không phải MEMBER bị chặn ROLE_FORBIDDEN, không ghi gì vào DB", async () => {
  const { service, db } = workoutsFixture("TRAINER");
  await assert.rejects(
    service.create("Bearer token", { title: "Ngực" }),
    (error) => error instanceof ForbiddenException && code(error) === "ROLE_FORBIDDEN",
  );
  assert.equal(db.memberProfile.findUnique.mock.callCount(), 0);
  assert.equal(db.$transaction.mock.callCount(), 0);
});

test("UC13 — xóa buổi tập của hội viên khác trả FORBIDDEN và không xóa", async () => {
  const { service, tx } = workoutsFixture("MEMBER");
  tx.workoutSession.findUnique.mock.mockImplementation(async () => ({
    memberId: randomUUID(),
    exercises: [{ exerciseKey: "bench press" }],
  }));
  await assert.rejects(
    service.remove("Bearer token", randomUUID()),
    (error) => error instanceof ForbiddenException && code(error) === "FORBIDDEN",
  );
  assert.equal(tx.workoutSession.delete.mock.callCount(), 0);
});

test("UC13 — lịch sử tập với pageSize = 51 (vượt biên 50) trả VALIDATION_ERROR trước khi truy vấn", async () => {
  const { service, db } = workoutsFixture("MEMBER");
  await assert.rejects(
    service.listMine("Bearer token", { pageSize: "51", from: "2026-02-30" }),
    (error) => {
      assert.ok(error instanceof BadRequestException);
      const body = error.getResponse() as { code: string; fieldErrors: Record<string, string> };
      assert.equal(body.code, "VALIDATION_ERROR");
      assert.deepEqual(Object.keys(body.fieldErrors).sort(), ["from", "pageSize"]);
      return true;
    },
  );
  assert.equal(db.workoutSession.count.mock.callCount(), 0);
  assert.equal(db.workoutSession.findMany.mock.callCount(), 0);
});

function notificationsFixture() {
  const prisma = {
    notification: {
      findUnique: mock.fn(async (_query: unknown): Promise<Notification | null> => null),
      update: mock.fn(),
      count: mock.fn(async () => 0),
    },
  };
  const push: PushAdapter = { sendPush: mock.fn(async () => undefined) };
  const appointments: AppointmentSource = { isConfirmed: mock.fn(async () => true) };
  const service = new NotificationsService(
    prisma as unknown as PrismaService,
    push,
    appointments,
  );
  return { service, prisma, push, appointments };
}

test("UC16 — đánh dấu đã đọc thông báo của người khác trả FORBIDDEN và không cập nhật", async () => {
  const { service, prisma } = notificationsFixture();
  prisma.notification.findUnique.mock.mockImplementation(async () => ({
    id: randomUUID(),
    recipientId: randomUUID(),
    reminderId: null,
    type: "PT_REMINDER",
    title: "Nhắc lịch PT",
    body: "Buổi tập sắp bắt đầu",
    targetScreen: "PT_APPOINTMENTS",
    sourceId: randomUUID(),
    isRead: false,
    readAt: null,
    createdAt: new Date(),
  }) as unknown as Notification);
  await assert.rejects(
    service.markRead(user("MEMBER"), randomUUID()),
    (error) => error instanceof ForbiddenException && code(error) === "FORBIDDEN",
  );
  assert.equal(prisma.notification.update.mock.callCount(), 0);
});

test("UC16 — push lỗi vẫn giữ thông báo trong hộp thư, ghi DeliveryAttempt FAILED (BR04, E1)", async () => {
  const now = new Date("2030-05-15T01:00:00Z");
  const recipientId = randomUUID();
  const reminder = {
    id: randomUUID(),
    recipientId,
    sourceType: "APPOINTMENT",
    sourceId: randomUUID(),
    reminderType: "PT_REMINDER_2H",
    scheduledAt: new Date("2030-05-15T00:00:00Z"),
    status: "PENDING",
    sentAt: null,
  } as unknown as Reminder;
  const created = { id: randomUUID(), recipientId, title: "t", body: "b", targetScreen: "PT_APPOINTMENTS" };
  const tx = {
    reminder: { updateMany: mock.fn(async () => ({ count: 1 })) },
    notification: { create: mock.fn(async () => created) },
  };
  const attempts: { status: string }[] = [];
  const prisma = {
    reminder: { findMany: mock.fn(async () => [reminder]) },
    pushDevice: {
      findMany: mock.fn(async () => [{ pushToken: "device-token", enabled: true }]),
    },
    deliveryAttempt: {
      create: mock.fn(async ({ data }: { data: { status: string } }) => {
        attempts.push(data);
        return data;
      }),
    },
    $transaction: mock.fn((run: (t: typeof tx) => unknown) => run(tx)),
  };
  const push: PushAdapter = {
    sendPush: mock.fn(async () => {
      throw new Error("FCM UNREGISTERED");
    }),
  };
  const service = new NotificationsService(
    prisma as unknown as PrismaService,
    push,
    { isConfirmed: async () => true },
  );

  const result = await service.processDueReminders({ now });

  assert.equal(result.sent, 1);
  assert.equal(result.pushSent, 0);
  assert.equal(result.pushFailed, 1);
  assert.equal(tx.notification.create.mock.callCount(), 1);
  assert.deepEqual(attempts.map((a) => a.status), ["FAILED"]);
});
