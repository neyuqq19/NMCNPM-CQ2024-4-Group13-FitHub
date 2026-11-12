import "reflect-metadata";
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { AllExceptionsFilter } from "../src/common/filters/http-exception.filter";
import { hashPassword } from "../src/modules/auth/password";
import { NotificationsService } from "../src/modules/notifications/notifications.service";

for (const value of [process.env.DATABASE_URL, process.env.DIRECT_URL]) {
  const u = new URL(value || "postgresql://invalid/invalid");
  if (!["localhost", "127.0.0.1"].includes(u.hostname) || u.pathname != "/fithub_test")
    throw Error("Notification tests require isolated fithub_test.");
}
const db = new PrismaClient();
let app: Awaited<ReturnType<typeof NestFactory.create>>;
let api: ReturnType<typeof request>;
let service: NotificationsService;
const created: { users: string[]; profiles: string[]; memberships: string[]; packs: string[] } = {
  users: [],
  profiles: [],
  memberships: [],
  packs: [],
};
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const HOUR = 3600_000;

async function makeUser(role: "ADMIN" | "TRAINER" | "MEMBER") {
  const user = await db.user.create({
    data: {
      email: `uc16-${randomUUID()}@example.com`,
      displayName: `UC16 ${role}`,
      passwordHash: await hashPassword("FitHubTest!2026"),
      role,
      status: "ACTIVE",
      verifiedAt: new Date(),
    },
  });
  created.users.push(user.id);
  const value = randomUUID() + randomUUID();
  await db.session.create({
    data: {
      userId: user.id,
      tokenHash: createHash("sha256").update(value).digest("hex"),
      deviceId: randomUUID(),
      requestId: randomUUID(),
      platform: role === "MEMBER" ? "MOBILE" : "WEB",
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  return { id: user.id, token: value };
}
let pack: { id: string };
let confirmer: { id: string; token: string } | undefined;
async function makeMembership(
  userId: string,
  opts: { start: string; end: string; status: "ACTIVE" | "FROZEN" | "SCHEDULED"; memberId?: string },
) {
  let memberId = opts.memberId;
  if (!memberId) {
    const profile = await db.memberProfile.create({
      data: { userId, memberCode: `UC16-${randomUUID().slice(0, 8)}` },
    });
    created.profiles.push(profile.id);
    memberId = profile.id;
  }
  const cashier = (confirmer ??= await makeUser("ADMIN"));
  // The database only accepts a paid membership together with its confirmed payment.
  const m = await db.$transaction(async (tx) => {
    const row = await tx.membership.create({
    data: {
      code: `UC16-${randomUUID().slice(0, 8)}`,
      requestId: randomUUID(),
      memberId,
      packageId: pack.id,
      packageNameSnapshot: "Gói UC16",
      durationMonthsSnapshot: 1,
      priceSnapshot: 100000,
      grantsGymAccessSnapshot: true,
      status: opts.status,
      startsOn: new Date(`${opts.start}T00:00:00Z`),
      endsBefore: new Date(`${opts.end}T00:00:00Z`),
    },
    });
    await tx.payment.create({
      data: {
        code: `UC16-${randomUUID().slice(0, 8)}`,
        membershipId: row.id,
        amount: 100000,
        idempotencyKey: randomUUID(),
        status: "CONFIRMED",
        confirmedById: cashier.id,
        confirmedAt: new Date(),
      },
    });
    return row;
  });
  created.memberships.push(m.id);
  return { id: m.id, memberId };
}
// Notifications of a user, newest first, read straight from the database.
const inbox = (userId: string) =>
  db.notification.findMany({ where: { recipientId: userId }, orderBy: { createdAt: "desc" } });

before(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  await app.init();
  api = request(app.getHttpServer());
  service = app.get(NotificationsService);
  // Leftovers of earlier runs (paid memberships cannot be deleted) must not be dispatched by this one.
  await db.reminder.deleteMany({ where: { recipient: { email: { startsWith: "uc16-" } } } });
  const p = await db.package.create({
    data: { code: `UC16-${randomUUID().slice(0, 8)}`, name: "Gói UC16", durationMonths: 1, price: 100000 },
  });
  created.packs.push(p.id);
  pack = p;
});
after(async () => {
  // Reminders must not outlive the run: a leftover PENDING one would be sent by the next run's dispatcher.
  const mine = { recipientId: { in: created.users } };
  await db.reminder.deleteMany({ where: mine });
  await db.notification.deleteMany({ where: mine });
  // Confirmed payments are immutable by design, so a paid membership (and the people behind it) stays.
  // Everything else is removed; a refusal here is expected and harmless.
  for (const remove of [
    () => db.pushDevice.deleteMany({ where: { userId: { in: created.users } } }),
    () => db.session.deleteMany({ where: { userId: { in: created.users } } }),
    () => db.user.deleteMany({ where: { id: { in: created.users }, memberProfile: null } }),
  ])
    await remove().catch(() => undefined);
  await app.close();
  await db.$disconnect();
});

test("NTF-01/02: inbox is private, newest first, filterable, and marking read lowers the badge", async () => {
  const me = await makeUser("MEMBER");
  const other = await makeUser("MEMBER");
  const base = Date.now();
  const mk = (recipientId: string, i: number, type: "PT_REMINDER" | "PACKAGE_EXPIRY", isRead = false) =>
    db.notification.create({
      data: {
        recipientId,
        type,
        title: `n${i}`,
        body: "b",
        isRead,
        targetScreen: type === "PT_REMINDER" ? "PT_APPOINTMENTS" : "MY_PACKAGE",
        createdAt: new Date(base + i * 1000),
      },
    });
  const a = await mk(me.id, 1, "PT_REMINDER");
  await mk(me.id, 2, "PACKAGE_EXPIRY");
  await mk(me.id, 3, "PT_REMINDER", true);
  const theirs = await mk(other.id, 4, "PT_REMINDER");

  const list = await api.get("/api/notifications/my").set(auth(me.token));
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.items.map((n: { title: string }) => n.title), ["n3", "n2", "n1"]);
  assert.equal(list.body.unreadCount, 2);
  assert.equal(list.body.total, 3);

  const pt = await api.get("/api/notifications/my?type=PT_REMINDER").set(auth(me.token));
  assert.equal(pt.body.items.length, 2);
  assert.equal(pt.body.unreadCount, 2); // badge ignores the filter
  const unread = await api.get("/api/notifications/my?unreadOnly=true").set(auth(me.token));
  assert.equal(unread.body.items.length, 2);
  assert.equal((await api.get("/api/notifications/my?type=NOPE").set(auth(me.token))).status, 400);
  assert.equal((await api.get("/api/notifications/my")).status, 401);

  // SR01: someone else's notification is off limits.
  const forbidden = await api.patch(`/api/notifications/${theirs.id}/read`).set(auth(me.token));
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.body.code, "FORBIDDEN");
  assert.equal((await db.notification.findUniqueOrThrow({ where: { id: theirs.id } })).isRead, false);
  assert.equal((await api.patch(`/api/notifications/${randomUUID()}/read`).set(auth(me.token))).status, 404);

  const read = await api.patch(`/api/notifications/${a.id}/read`).set(auth(me.token));
  assert.equal(read.status, 200);
  assert.equal(read.body.notification.isRead, true);
  assert.equal(read.body.unreadCount, 1);
  const again = await api.patch(`/api/notifications/${a.id}/read`).set(auth(me.token));
  assert.equal(again.body.unreadCount, 1); // idempotent

  const all = await api.post("/api/notifications/read-all").set(auth(me.token));
  assert.equal(all.status, 200);
  assert.deepEqual({ updated: all.body.updated, unread: all.body.unreadCount }, { updated: 1, unread: 0 });
  assert.equal((await db.notification.findUniqueOrThrow({ where: { id: theirs.id } })).isRead, false);
});

test("NTF-03: appointment reminders go to member and PT, once, and only for future moments", async () => {
  const member = await makeUser("MEMBER");
  const trainer = await makeUser("TRAINER");
  const now = new Date("2026-11-12T00:00:00Z");
  const appointmentId = randomUUID();
  const start = new Date(now.getTime() + 48 * HOUR);
  const input = { appointmentId, startTime: start, memberUserId: member.id, trainerUserId: trainer.id, now };
  assert.deepEqual(await service.scheduleAppointmentReminders(input), { scheduled: 4 });
  await service.scheduleAppointmentReminders(input); // idempotent
  assert.equal(await db.reminder.count({ where: { sourceId: appointmentId } }), 4);

  const soon = randomUUID();
  await service.scheduleAppointmentReminders({
    appointmentId: soon,
    startTime: new Date(now.getTime() + 10 * HOUR),
    memberUserId: member.id,
    now,
  });
  const rows = await db.reminder.findMany({ where: { sourceId: soon } });
  assert.deepEqual(rows.map((r) => r.reminderType), ["PT_REMINDER_2H"]);

  // Cancelling the appointment cancels what has not been sent.
  assert.deepEqual(await service.cancelRemindersBySource("APPOINTMENT", appointmentId), { cancelled: 4 });
  assert.equal(await db.reminder.count({ where: { sourceId: appointmentId, status: "PENDING" } }), 0);
});

test("NTF-04: due reminders become inbox rows exactly once (BR04) and a cancelled source is never sent (BR03)", async () => {
  const member = await makeUser("MEMBER");
  const now = new Date("2026-11-12T00:00:00Z");
  const appointmentId = randomUUID();
  await service.scheduleAppointmentReminders({
    appointmentId,
    startTime: new Date("2026-11-12T05:00:00Z"),
    memberUserId: member.id,
    now: new Date("2026-11-11T00:00:00Z"),
  });
  // T-24h is 11/11 05:00Z and T-2h is 12/11 03:00Z; at `now` only the 24h one is due.
  assert.equal((await service.processDueReminders({ now })).sent, 1);
  const got = await inbox(member.id);
  assert.equal(got.length, 1);
  assert.ok(got[0]!.type === "PT_REMINDER" && got[0]!.targetScreen === "PT_APPOINTMENTS" && !got[0]!.isRead);
  assert.equal((await service.processDueReminders({ now })).sent, 0); // no duplicates
  assert.equal((await inbox(member.id)).length, 1);
  // Later the 2h reminder is due as well.
  assert.equal((await service.processDueReminders({ now: new Date("2026-11-12T03:30:00Z") })).sent, 1);
  assert.equal((await inbox(member.id)).length, 2);

  // BR03: appointment no longer CONFIRMED -> reminder cancelled, nothing sent.
  const other = await makeUser("MEMBER");
  const cancelled = randomUUID();
  await service.scheduleAppointmentReminders({
    appointmentId: cancelled,
    startTime: new Date("2026-11-20T05:00:00Z"),
    memberUserId: other.id,
    now: new Date("2026-11-11T00:00:00Z"),
  });
  const internals = service as unknown as { appointments: { isConfirmed(id: string): Promise<boolean> } };
  const original = internals.appointments;
  internals.appointments = { isConfirmed: async () => false };
  try {
    await service.processDueReminders({ now: new Date("2026-11-20T04:00:00Z") });
  } finally {
    internals.appointments = original;
  }
  assert.equal((await inbox(other.id)).length, 0);
  assert.equal(await db.reminder.count({ where: { sourceId: cancelled, status: "CANCELLED" } }), 2);
});

test("NTF-05 + E1: the inbox row survives a push failure, and every attempt is recorded", async () => {
  const member = await makeUser("MEMBER");
  const now = new Date("2026-11-12T00:00:00Z");
  // Starts 12/11 05:00Z: its 2h reminder (03:00Z) is due at `now`+4h, the 24h one earlier.
  const due = new Date("2026-11-12T04:00:00Z");
  const schedule = (id: string) =>
    service.scheduleAppointmentReminders({
      appointmentId: id,
      startTime: new Date("2026-11-12T05:00:00Z"),
      memberUserId: member.id,
      now: new Date("2026-11-12T02:00:00Z"), // after the 24h moment: only the 2h reminder exists
    });
  void now;

  // Not registered yet -> inbox row exists, attempt FAILED.
  await schedule(randomUUID());
  await service.processDueReminders({ now: due });
  let rows = await db.notification.findMany({
    where: { recipientId: member.id },
    include: { deliveryAttempts: true },
  });
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0]!.deliveryAttempts.map((a) => a.status), ["FAILED"]);

  // Register a device, push works -> SENT.
  const dev = await api
    .post("/api/notifications/devices")
    .set(auth(member.token))
    .send({ deviceId: "phone-1", platform: "MOBILE", pushToken: "fcm-token-1" });
  assert.equal(dev.status, 200);
  assert.equal(dev.body.enabled, true);
  await schedule(randomUUID());
  const ok = await service.processDueReminders({ now: due });
  assert.equal(ok.pushSent, 1);

  // E1: push throws -> inbox row still there, attempt FAILED with the message.
  await schedule(randomUUID());
  const bad = await service.processDueReminders({ now: due, simulatePushFailure: true });
  assert.equal(bad.sent, 1);
  assert.equal(bad.pushFailed, 1);
  rows = await db.notification.findMany({
    where: { recipientId: member.id },
    include: { deliveryAttempts: true },
    orderBy: { createdAt: "asc" },
  });
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.deliveryAttempts[0]!.status), ["FAILED", "SENT", "FAILED"]);
  assert.match(rows[2]!.deliveryAttempts[0]!.errorMessage || "", /Simulated FCM/);

  // Same device re-registered updates the row instead of adding one.
  await api
    .post("/api/notifications/devices")
    .set(auth(member.token))
    .send({ deviceId: "phone-1", platform: "MOBILE", pushToken: "fcm-token-2", enabled: false });
  const devices = await db.pushDevice.findMany({ where: { userId: member.id } });
  assert.deepEqual(devices.map((d) => [d.pushToken, d.enabled]), [["fcm-token-2", false]]);
});

test("NTF-05: device registration is validated and not open to admins", async () => {
  const member = await makeUser("MEMBER");
  const admin = await makeUser("ADMIN");
  const post = (token: string, body: unknown) =>
    api.post("/api/notifications/devices").set(auth(token)).send(body as object);
  assert.equal((await post(admin.token, { deviceId: "d", platform: "WEB", pushToken: "t" })).status, 403);
  assert.equal((await post(member.token, { platform: "MOBILE", pushToken: "t" })).status, 400);
  assert.equal((await post(member.token, { deviceId: "d", platform: "TV", pushToken: "t" })).status, 400);
  assert.equal((await post(member.token, { deviceId: "d", platform: "MOBILE", pushToken: "" })).status, 400);
  assert.equal(
    (await post(member.token, { deviceId: "d", platform: "MOBILE", pushToken: "t", enabled: "yes" })).status,
    400,
  );
});

test("NTF-04: only an admin can run the dispatcher, and `now` is validated", async () => {
  const member = await makeUser("MEMBER");
  const admin = await makeUser("ADMIN");
  assert.equal((await api.post("/api/notifications/dispatch-due").set(auth(member.token))).status, 403);
  assert.equal((await api.post("/api/notifications/dispatch-due").send({})).status, 401);
  assert.equal(
    (await api.post("/api/notifications/dispatch-due").set(auth(admin.token)).send({ now: "not-a-date" })).status,
    400,
  );
  const ok = await api.post("/api/notifications/dispatch-due").set(auth(admin.token)).send({});
  assert.equal(ok.status, 200);
  assert.equal(typeof ok.body.sent, "number");
});

test("BR02/BR03/A1/A2: package expiry reminders follow the membership", async () => {
  const member = await makeUser("MEMBER");
  const m = await makeMembership(member.id, { start: "2026-10-01", end: "2026-11-20", status: "ACTIVE" });
  const before = new Date("2026-11-01T00:00:00Z");
  assert.deepEqual(await service.scheduleMembershipExpiryReminders(m.id, before), { scheduled: 2 });
  assert.deepEqual(
    (await db.reminder.findMany({ where: { sourceId: m.id }, orderBy: { scheduledAt: "asc" } })).map(
      (r) => r.reminderType,
    ),
    ["PACKAGE_EXPIRY_7D", "PACKAGE_EXPIRY_3D"],
  );

  // A2: FROZEN -> nothing is sent, the reminders stay pending.
  await db.membership.update({ where: { id: m.id }, data: { status: "FROZEN" } });
  const due7 = new Date("2026-11-13T02:00:00Z"); // 7d reminder is 13/11 08:00 gym time
  const frozen = await service.processDueReminders({ now: due7 });
  assert.equal(frozen.sent, 0);
  assert.ok(frozen.deferred >= 1);
  assert.equal((await inbox(member.id)).length, 0);
  assert.equal(await db.reminder.count({ where: { sourceId: m.id, status: "PENDING" } }), 2);

  // Unfrozen with a later end date: a stale due reminder follows the new end date instead of firing.
  // The 3d one is not due yet, so it is only corrected when its own turn comes.
  await db.membership.update({
    where: { id: m.id },
    data: { status: "ACTIVE", endsBefore: new Date("2026-11-27T00:00:00Z") },
  });
  const moved = await service.processDueReminders({ now: due7 });
  assert.equal(moved.sent, 0);
  const pending = await db.reminder.findMany({
    where: { sourceId: m.id, status: "PENDING" },
    orderBy: { scheduledAt: "asc" },
  });
  assert.deepEqual(pending.map((r) => r.scheduledAt.toISOString()), [
    "2026-11-17T01:00:00.000Z",
    "2026-11-20T01:00:00.000Z",
  ]);

  // Valid and due: the 7d reminder is sent once.
  const sent = await service.processDueReminders({ now: new Date("2026-11-20T02:00:00Z") });
  assert.equal(sent.sent, 1);
  const rows = await inbox(member.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.type, "PACKAGE_EXPIRY");
  assert.equal(rows[0]!.targetScreen, "MY_PACKAGE");
  assert.match(rows[0]!.title, /7 ngày/);

  // A1: the member renewed (a SCHEDULED membership starts when this one ends) -> the 3d reminder is skipped.
  await makeMembership(member.id, {
    start: "2026-11-27",
    end: "2027-02-27",
    status: "SCHEDULED",
    memberId: m.memberId,
  });
  await service.processDueReminders({ now: new Date("2026-11-24T02:00:00Z") });
  assert.equal((await inbox(member.id)).length, 1);
  assert.equal(await db.reminder.count({ where: { sourceId: m.id, status: "SKIPPED" } }), 1);
});

test("pauseRemindersOnFreeze shifts pending reminders to the new end date", async () => {
  const member = await makeUser("MEMBER");
  const m = await makeMembership(member.id, { start: "2026-10-01", end: "2026-12-01", status: "ACTIVE" });
  const now = new Date("2026-11-01T00:00:00Z");
  await service.scheduleMembershipExpiryReminders(m.id, now);
  const res = await service.pauseRemindersOnFreeze(m.id, new Date("2026-12-15T00:00:00Z"), now);
  assert.equal(res.rescheduled, 2);
  const rows = await db.reminder.findMany({ where: { sourceId: m.id }, orderBy: { scheduledAt: "asc" } });
  assert.deepEqual(rows.map((r) => r.scheduledAt.toISOString()), [
    "2026-12-08T01:00:00.000Z",
    "2026-12-12T01:00:00.000Z",
  ]);
  assert.ok(rows.every((r) => r.status === "PENDING"));
});
