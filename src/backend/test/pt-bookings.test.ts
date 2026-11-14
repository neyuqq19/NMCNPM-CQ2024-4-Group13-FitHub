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
import { PtBookingsService } from "../src/modules/pt-bookings/pt-bookings.service";

for (const value of [process.env.DATABASE_URL, process.env.DIRECT_URL]) {
  const u = new URL(value || "postgresql://invalid/invalid");
  if (!["localhost", "127.0.0.1"].includes(u.hostname) || u.pathname != "/fithub_test")
    throw Error("UC08 tests require isolated fithub_test.");
}
const db = new PrismaClient();
let app: Awaited<ReturnType<typeof NestFactory.create>>;
let api: ReturnType<typeof request>;
let service: PtBookingsService;
let pack: { id: string };
let admin: { id: string; token: string };
const users: string[] = [];
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const HOUR = 3600_000;
const MIN = 60_000;
const realNow = () => new Date();

async function makeUser(role: "ADMIN" | "TRAINER" | "MEMBER") {
  const user = await db.user.create({
    data: {
      email: `uc08-${randomUUID()}@example.com`,
      displayName: `UC08 ${role}`,
      passwordHash: await hashPassword("FitHubTest!2026"),
      role,
      status: "ACTIVE",
      verifiedAt: new Date(),
    },
  });
  users.push(user.id);
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
async function makeTrainer() {
  const u = await makeUser("TRAINER");
  const profile = await db.trainerProfile.upsert({
    where: { userId: u.id },
    update: {},
    create: { userId: u.id, trainerCode: `T08-${randomUUID().slice(0, 8)}` },
  });
  return { ...u, profileId: profile.id };
}
// Hội viên + gói ACTIVE có `pt` buổi PT (gói phải đi kèm thanh toán đã xác nhận).
async function makeMember(pt: number) {
  const u = await makeUser("MEMBER");
  const profile = await db.memberProfile.create({
    data: { userId: u.id, memberCode: `M08-${randomUUID().slice(0, 8)}` },
  });
  const membership = await db.$transaction(async (tx) => {
    const m = await tx.membership.create({
      data: {
        code: `M08-${randomUUID().slice(0, 8)}`,
        requestId: randomUUID(),
        memberId: profile.id,
        packageId: pack.id,
        packageNameSnapshot: "Gói UC08",
        durationMonthsSnapshot: 1,
        priceSnapshot: 100000,
        grantsGymAccessSnapshot: true,
        ptSessionsSnapshot: pt,
        ptSessionsRemaining: pt,
        status: "ACTIVE",
        startsOn: new Date("2026-11-01T00:00:00Z"),
        endsBefore: new Date("2031-01-01T00:00:00Z"),
      },
    });
    await tx.payment.create({
      data: {
        code: `M08-${randomUUID().slice(0, 8)}`,
        membershipId: m.id,
        amount: 100000,
        idempotencyKey: randomUUID(),
        status: "CONFIRMED",
        confirmedById: admin.id,
        confirmedAt: new Date(),
      },
    });
    return m;
  });
  return { ...u, profileId: profile.id, membershipId: membership.id };
}
let dayCounter = 0;
// Ca 60 phút trong tương lai xa, giờ bắt đầu cố định để tính mốc 12h/6h chính xác.
async function makeSlot(trainerId: string, time = "09:00") {
  const date = new Date(Date.UTC(2030, 4, 1 + dayCounter++)).toISOString().slice(0, 10);
  const startTime = new Date(`${date}T${time}:00+07:00`);
  return db.workingSlot.create({
    data: {
      trainerId,
      workDate: new Date(date),
      startTime,
      endTime: new Date(startTime.getTime() + HOUR),
    },
  });
}
const remaining = async (membershipId: string) =>
  (await db.membership.findUniqueOrThrow({ where: { id: membershipId } })).ptSessionsRemaining;
const book = (token: string, slotId: string) =>
  api.post("/api/appointments").set(auth(token)).send({ slotId });
// Đặt lịch với giờ thật rồi giả lập "bây giờ" khi hủy.
async function bookedAppointment(m: { token: string }, slotId: string) {
  const res = await book(m.token, slotId);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.appointment.id as string;
}
const clockAt = (slotStart: Date, msBefore: number) => {
  service.now = () => new Date(slotStart.getTime() - msBefore);
};

before(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  await app.init();
  api = request(app.getHttpServer());
  service = app.get(PtBookingsService);
  pack = await db.package.create({
    data: { code: `UC08-${randomUUID().slice(0, 8)}`, name: "Gói UC08", durationMonths: 1, price: 100000 },
  });
  admin = await makeUser("ADMIN");
});
after(async () => {
  service.now = realNow;
  const mine = { recipientId: { in: users } };
  await db.reminder.deleteMany({ where: mine });
  await db.notification.deleteMany({ where: mine });
  await app.close();
  await db.$disconnect();
});

test("APT-01: đặt lịch giữ 1 buổi PT, đóng ca và hẹn nhắc lịch", async () => {
  const pt = await makeTrainer();
  const m = await makeMember(2);
  const slot = await makeSlot(pt.profileId);
  const res = await book(m.token, slot.id);
  assert.equal(res.status, 201);
  assert.equal(res.body.appointment.status, "CONFIRMED");
  assert.equal(res.body.appointment.ptSessionState, "HELD");
  assert.equal(res.body.ptAvailable, 1);
  assert.equal(await remaining(m.membershipId), 1);
  const after = await db.workingSlot.findUniqueOrThrow({ where: { id: slot.id } });
  assert.equal(after.status, "BOOKED");
  assert.equal(after.memberId, m.profileId);
  const reminders = await db.reminder.count({
    where: { sourceType: "APPOINTMENT", sourceId: res.body.appointment.id, status: "PENDING" },
  });
  assert.ok(reminders >= 2, "24h/2h reminders scheduled");

  const mine = await api.get("/api/appointments/my").set(auth(m.token));
  assert.equal(mine.status, 200);
  assert.equal(mine.body.items.length, 1);
  assert.equal(mine.body.ptAvailable, 1);
  assert.equal((await api.post("/api/appointments").send({ slotId: slot.id })).status, 401);
  assert.equal((await book(pt.token, slot.id)).status, 403);
});

test("BR01: hết buổi PT thì bị chặn 400, còn đúng 1 buổi thì đặt được và về 0", async () => {
  const pt = await makeTrainer();
  const none = await makeMember(0);
  const one = await makeMember(1);
  const res = await book(none.token, (await makeSlot(pt.profileId)).id);
  assert.equal(res.status, 400);
  assert.equal(res.body.code, "INSUFFICIENT_PT_SESSIONS");
  assert.equal((await book(one.token, (await makeSlot(pt.profileId, "11:00")).id)).status, 201);
  assert.equal(await remaining(one.membershipId), 0);
});

test("SR02/E1: hai hội viên cùng đặt một ca đồng thời, chỉ một người thành công", async () => {
  const pt = await makeTrainer();
  const a = await makeMember(3);
  const b = await makeMember(3);
  const slot = await makeSlot(pt.profileId);
  const [x, y] = await Promise.all([book(a.token, slot.id), book(b.token, slot.id)]);
  assert.deepEqual([x.status, y.status].sort(), [201, 409]);
  const loser = x.status === 409 ? x : y;
  assert.equal(loser.body.code, "SLOT_ALREADY_BOOKED");
  assert.equal(await db.appointment.count({ where: { slotId: slot.id } }), 1);
  // Người thua không bị trừ buổi.
  const loserMember = x.status === 409 ? a : b;
  assert.equal(await remaining(loserMember.membershipId), 3);
});

test("một hội viên không đặt được hai ca trùng giờ", async () => {
  const p1 = await makeTrainer();
  const p2 = await makeTrainer();
  const m = await makeMember(3);
  const s1 = await makeSlot(p1.profileId);
  const startTime = s1.startTime;
  const s2 = await db.workingSlot.create({
    data: {
      trainerId: p2.profileId,
      workDate: s1.workDate,
      startTime,
      endTime: s1.endTime,
    },
  });
  assert.equal((await book(m.token, s1.id)).status, 201);
  const res = await book(m.token, s2.id);
  assert.equal(res.status, 409);
  assert.equal(res.body.code, "MEMBER_TIME_CONFLICT");
  assert.equal(await remaining(m.membershipId), 2);
});

test("APT-03: hội viên hủy, mốc 12h00 hoàn buổi, 11h59 trừ hẳn buổi, cả hai đều mở lại ca", async () => {
  const pt = await makeTrainer();
  const m = await makeMember(3);
  const s1 = await makeSlot(pt.profileId);
  const s2 = await makeSlot(pt.profileId);
  const a1 = await bookedAppointment(m, s1.id);
  const a2 = await bookedAppointment(m, s2.id);
  assert.equal(await remaining(m.membershipId), 1);
  try {
    clockAt(s1.startTime, 12 * HOUR);
    const early = await api.post(`/api/appointments/${a1}/cancel-by-member`).set(auth(m.token));
    assert.equal(early.status, 200, JSON.stringify(early.body));
    assert.equal(early.body.ptSessionOutcome, "REFUND");
    assert.equal(early.body.appointment.ptSessionState, "REFUNDED");
    assert.equal(await remaining(m.membershipId), 2);

    clockAt(s2.startTime, 12 * HOUR - MIN);
    const late = await api.post(`/api/appointments/${a2}/cancel-by-member`).set(auth(m.token));
    assert.equal(late.status, 200);
    assert.equal(late.body.ptSessionOutcome, "CONSUME");
    assert.equal(late.body.appointment.ptSessionState, "CONSUMED");
    assert.equal(await remaining(m.membershipId), 2);
  } finally {
    service.now = realNow;
  }
  for (const s of [s1, s2]) {
    const row = await db.workingSlot.findUniqueOrThrow({ where: { id: s.id } });
    assert.equal(row.status, "OPEN");
    assert.equal(row.memberId, null);
  }
  for (const id of [a1, a2])
    assert.equal(await db.reminder.count({ where: { sourceId: id, status: "PENDING" } }), 0);
  // Hủy lần hai và hủy lịch của người khác đều bị chặn.
  assert.equal((await api.post(`/api/appointments/${a1}/cancel-by-member`).set(auth(m.token))).status, 409);
  const other = await makeMember(1);
  const a3 = await bookedAppointment(m, (await makeSlot(pt.profileId)).id);
  assert.equal((await api.post(`/api/appointments/${a3}/cancel-by-member`).set(auth(other.token))).status, 403);
  assert.equal((await api.post(`/api/appointments/${randomUUID()}/cancel-by-member`).set(auth(m.token))).status, 404);
});

test("APT-04: PT hủy, mốc 6h00 chỉ hoàn, 5h59 hoàn và đền bù +1 buổi", async () => {
  const pt = await makeTrainer();
  const stranger = await makeTrainer();
  const m = await makeMember(2);
  const s1 = await makeSlot(pt.profileId);
  const s2 = await makeSlot(pt.profileId);
  const a1 = await bookedAppointment(m, s1.id);
  const a2 = await bookedAppointment(m, s2.id);
  assert.equal(await remaining(m.membershipId), 0);

  const noReason = await api.post(`/api/appointments/${a1}/cancel-by-pt`).set(auth(pt.token)).send({});
  assert.equal(noReason.status, 400);
  assert.equal(noReason.body.code, "REASON_REQUIRED");
  const notMine = await api
    .post(`/api/appointments/${a1}/cancel-by-pt`)
    .set(auth(stranger.token))
    .send({ reason: "x" });
  assert.equal(notMine.status, 403);
  assert.equal((await api.post(`/api/appointments/${a1}/cancel-by-pt`).set(auth(m.token)).send({ reason: "x" })).status, 403);

  try {
    clockAt(s1.startTime, 6 * HOUR);
    const early = await api.post(`/api/appointments/${a1}/cancel-by-pt`).set(auth(pt.token)).send({ reason: "Ốm" });
    assert.equal(early.status, 200, JSON.stringify(early.body));
    assert.equal(early.body.ptSessionOutcome, "REFUND");
    assert.equal(early.body.appointment.compensationGranted, false);
    assert.equal(await remaining(m.membershipId), 1);

    clockAt(s2.startTime, 6 * HOUR - MIN);
    const late = await api.post(`/api/appointments/${a2}/cancel-by-pt`).set(auth(pt.token)).send({ reason: "Việc gia đình" });
    assert.equal(late.status, 200);
    assert.equal(late.body.ptSessionOutcome, "REFUND_WITH_COMPENSATION");
    assert.equal(late.body.appointment.compensationGranted, true);
  } finally {
    service.now = realNow;
  }
  // 0 -> +1 (hoàn ca 1) -> +2 (hoàn ca 2 và đền bù) = 3 buổi, nhiều hơn gói gốc 2 buổi.
  const m2 = await db.membership.findUniqueOrThrow({ where: { id: m.membershipId } });
  assert.equal(m2.ptSessionsRemaining, 3);
  assert.equal(m2.ptSessionsSnapshot, 3);
  // PT báo không đứng lớp nên ca không mở lại cho người khác đặt.
  assert.equal((await db.workingSlot.findUniqueOrThrow({ where: { id: s2.id } })).status, "UNAVAILABLE");
});

test("APT-05: chỉ ADMIN xác minh NO_SHOW và chỉ sau khi ca kết thúc", async () => {
  const pt = await makeTrainer();
  const m = await makeMember(1);
  const slot = await makeSlot(pt.profileId);
  const id = await bookedAppointment(m, slot.id);
  const url = `/api/appointments/${id}/verify-no-show`;
  try {
    service.now = () => new Date(slot.endTime.getTime() - 1);
    const early = await api.post(url).set(auth(admin.token));
    assert.equal(early.status, 400);
    assert.equal(early.body.code, "SLOT_NOT_ENDED");
    service.now = () => slot.endTime;
    assert.equal((await api.post(url).set(auth(m.token))).status, 403);
    assert.equal((await api.post(url).set(auth(pt.token))).status, 403);
    const ok = await api.post(url).set(auth(admin.token));
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.appointment.status, "NO_SHOW");
    assert.equal(ok.body.appointment.ptSessionState, "CONSUMED");
    assert.equal((await api.post(url).set(auth(admin.token))).status, 409);
  } finally {
    service.now = realNow;
  }
  assert.equal(await remaining(m.membershipId), 0);
  assert.equal(await db.auditLog.count({ where: { entityId: id, action: "VERIFY_NO_SHOW" } }), 1);
});

test("APT-02: Admin lọc được toàn bộ, PT chỉ thấy lịch của mình, hội viên không vào được danh sách quản trị", async () => {
  const pt = await makeTrainer();
  const other = await makeTrainer();
  const m = await makeMember(2);
  await bookedAppointment(m, (await makeSlot(pt.profileId)).id);
  await bookedAppointment(m, (await makeSlot(other.profileId, "14:00")).id);
  const mineAsPt = await api.get("/api/appointments").set(auth(pt.token));
  assert.equal(mineAsPt.status, 200);
  assert.equal(mineAsPt.body.items.length, 1);
  assert.equal(mineAsPt.body.items[0].trainer.id, pt.profileId);
  const all = await api.get(`/api/appointments?memberId=${m.profileId}&status=CONFIRMED`).set(auth(admin.token));
  assert.equal(all.body.items.length, 2);
  assert.equal((await api.get("/api/appointments?status=NOPE").set(auth(admin.token))).status, 400);
  assert.equal((await api.get("/api/appointments").set(auth(m.token))).status, 403);
});
