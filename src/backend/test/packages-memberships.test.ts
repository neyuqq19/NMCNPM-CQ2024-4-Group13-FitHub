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
import { CheckInsService } from "../src/modules/check-ins/check-ins.service";
import { MembershipsService } from "../src/modules/memberships/memberships.service";

for (const value of [process.env.DATABASE_URL, process.env.DIRECT_URL]) {
  const u = new URL(value || "postgresql://invalid/invalid");
  if (
    !["localhost", "127.0.0.1"].includes(u.hostname) ||
    u.pathname !== "/fithub_test"
  ) {
    throw new Error("UC05 tests require isolated fithub_test.");
  }
}

const db = new PrismaClient();
let app: Awaited<ReturnType<typeof NestFactory.create>>;
let api: ReturnType<typeof request>;
let adminToken: string;
let adminId: string;
let passwordHash: string;
let pack3M: { id: string; price: number };
let pack6M: { id: string; price: number };

const baseDay = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
let simulatedNow = new Date(`${baseDay}T03:00:00Z`); // 10:00 Vietnam time

function plusDays(isoDateStr: string, days: number): string {
  return new Date(new Date(`${isoDateStr}T00:00:00Z`).getTime() + days * 86400000)
    .toISOString()
    .slice(0, 10);
}

function setClock(isoDateStr: string, hourUtc = 3) {
  const hh = String(hourUtc).padStart(2, "0");
  simulatedNow = new Date(`${isoDateStr}T${hh}:00:00Z`);
}

const auth = (tk = adminToken) => ({ Authorization: `Bearer ${tk}` });

async function makeSessionToken(
  userId: string,
  platform: "WEB" | "MOBILE" = "WEB",
) {
  const raw = randomUUID() + randomUUID();
  await db.session.create({
    data: {
      userId,
      tokenHash: createHash("sha256").update(raw).digest("hex"),
      deviceId: randomUUID(),
      requestId: randomUUID(),
      platform,
      expiresAt: new Date("2028-01-01T00:00:00Z"),
    },
  });
  return raw;
}

async function createMemberFixture() {
  const u = await db.user.create({
    data: {
      email: `uc05-${randomUUID()}@example.com`,
      displayName: "Hội viên kiểm thử UC05",
      role: "MEMBER",
      status: "ACTIVE",
      verifiedAt: new Date("2026-11-01T00:00:00Z"),
      passwordHash,
    },
  });
  const m = await db.memberProfile.create({
    data: { userId: u.id, memberCode: `HV-${randomUUID().slice(0, 8)}` },
  });
  return {
    ...m,
    userId: u.id,
    token: await makeSessionToken(u.id, "MOBILE"),
  };
}

async function registerAndConfirm(
  memberId: string,
  packageId: string,
  price: number,
  startsOn: string,
) {
  const reg = await api
    .post(`/api/members/${memberId}/memberships`)
    .set(auth())
    .send({
      requestId: randomUUID(),
      packageId,
      startsOn,
      expectedPrice: price,
    });
  assert.equal(reg.status, 201, `Register failed: ${JSON.stringify(reg.body)}`);
  const conf = await api
    .post(`/api/payments/${reg.body.id}/confirm`)
    .set(auth())
    .send({
      idempotencyKey: randomUUID(),
      amount: price,
    });
  assert.equal(conf.status, 200, `Confirm failed: ${JSON.stringify(conf.body)}`);
  return conf.body.membership as {
    id: string;
    code: string;
    status: string;
    startsOn: string;
    endsBefore: string;
  };
}

before(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  api = request(app.getHttpServer());

  app.get(CheckInsService).now = () => simulatedNow;
  app.get(MembershipsService).now = () => simulatedNow;

  passwordHash = await hashPassword("Uc05Test!2026");
  const admin = await db.user.create({
    data: {
      email: `uc05-admin-${randomUUID()}@example.com`,
      displayName: "Admin UC05 Test",
      role: "ADMIN",
      status: "ACTIVE",
      verifiedAt: new Date("2026-11-01T00:00:00Z"),
      passwordHash,
    },
  });
  adminId = admin.id;
  adminToken = await makeSessionToken(admin.id, "WEB");

  const p3 = await db.package.create({
    data: {
      code: `GYM03-${randomUUID().slice(0, 6).toUpperCase()}`,
      name: "Gói 3 tháng UC05",
      durationMonths: 3,
      price: 1350000,
      grantsGymAccess: true,
      accessWindow: "REGULAR",
      ptSessionsIncluded: 0,
      isActive: true,
    },
  });
  pack3M = { id: p3.id, price: Number(p3.price) };

  const p6 = await db.package.create({
    data: {
      code: `GYM06-${randomUUID().slice(0, 6).toUpperCase()}`,
      name: "Gói 6 tháng + PT UC05",
      durationMonths: 6,
      price: 2400000,
      grantsGymAccess: true,
      accessWindow: "REGULAR",
      ptSessionsIncluded: 4,
      isActive: true,
    },
  });
  pack6M = { id: p6.id, price: Number(p6.price) };
});

after(async () => {
  await app?.close();
  await db.$disconnect();
});

test("UC05-01: package catalog create, duplicate code 409, update and status toggle", async () => {
  setClock(baseDay);
  const code = `PKG-${randomUUID().slice(0, 6).toUpperCase()}`;

  const created = await api
    .post("/api/packages")
    .set(auth())
    .send({
      code: `  ${code.toLowerCase()} `,
      name: "Gói VIP 12 tháng",
      durationMonths: 12,
      price: 4500000,
      grantsGymAccess: true,
      accessWindow: "REGULAR",
      ptSessionsIncluded: 10,
    });
  assert.equal(created.status, 201);
  assert.equal(created.body.code, code);
  assert.equal(created.body.ptSessionsIncluded, 10);

  const duplicate = await api
    .post("/api/packages")
    .set(auth())
    .send({
      code,
      name: "Gói trùng mã",
      durationMonths: 1,
      price: 500000,
    });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.code, "PACKAGE_CODE_EXISTS");

  const invalidDuration = await api
    .post("/api/packages")
    .set(auth())
    .send({
      code: `BAD-${randomUUID().slice(0, 5)}`,
      name: "Sai số tháng",
      durationMonths: 2,
      price: 500000,
    });
  assert.equal(invalidDuration.status, 400);

  const toggled = await api
    .patch(`/api/packages/${created.body.id}/status`)
    .set(auth())
    .send({ isActive: false });
  assert.equal(toggled.status, 200);
  assert.equal(toggled.body.isActive, false);
});

test("UC05-01b (FITHUB-205 #2 & #3): registering a package creates PENDING_PAYMENT membership and blocks duplicate registration when PENDING or ACTIVE (409 Conflict)", async () => {
  setClock(baseDay);
  const member = await createMemberFixture();

  // FITHUB-205 #2: Registering a package creates a PENDING_PAYMENT membership & PENDING payment
  const regPending = await api
    .post(`/api/members/${member.id}/memberships`)
    .set(auth())
    .send({
      requestId: randomUUID(),
      packageId: pack6M.id,
      startsOn: baseDay,
      expectedPrice: pack6M.price,
    });
  assert.equal(regPending.status, 201);
  assert.equal(regPending.body.status, "PENDING");
  assert.equal(regPending.body.membership.status, "PENDING_PAYMENT");
  assert.equal(regPending.body.membership.startsOn, baseDay);

  // FITHUB-205 #3a: Attempting a second registration while a PENDING_PAYMENT order exists -> 409 Conflict
  const dupWhilePending = await api
    .post(`/api/members/${member.id}/memberships`)
    .set(auth())
    .send({
      requestId: randomUUID(),
      packageId: pack3M.id,
      startsOn: baseDay,
      expectedPrice: pack3M.price,
    });
  assert.equal(dupWhilePending.status, 409);

  // Confirm payment -> membership transitions to ACTIVE
  const confirmed = await api
    .post(`/api/payments/${regPending.body.id}/confirm`)
    .set(auth())
    .send({
      idempotencyKey: randomUUID(),
      amount: pack6M.price,
    });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.membership.status, "ACTIVE");

  // FITHUB-205 #3b: Attempting to register an overlapping package while ACTIVE -> 409 Conflict
  const dupWhileActive = await api
    .post(`/api/members/${member.id}/memberships`)
    .set(auth())
    .send({
      requestId: randomUUID(),
      packageId: pack3M.id,
      startsOn: baseDay,
      expectedPrice: pack3M.price,
    });
  assert.equal(dupWhileActive.status, 409);
});

test("UC05-02: freeze eligibility (< 6 months rejected, expired rejected, out-of-range start date rejected, BVA 6/7/30/31 days)", async () => {
  setClock(baseDay);
  const member = await createMemberFixture();

  // 1. 3-month package cannot be frozen
  const m3 = await registerAndConfirm(
    member.id,
    pack3M.id,
    pack3M.price,
    baseDay,
  );
  const freeze3M = await api
    .post(`/api/memberships/${m3.id}/freeze`)
    .set(auth())
    .send({ days: 7, startsOn: baseDay, reason: "Đi công tác" });
  assert.equal(freeze3M.status, 400);
  assert.equal(freeze3M.body.code, "FREEZE_NOT_ELIGIBLE");

  // 2. 6-month package on another member: test BVA 6, 31, and out-of-range start date
  const member2 = await createMemberFixture();
  const m6 = await registerAndConfirm(
    member2.id,
    pack6M.id,
    pack6M.price,
    baseDay,
  );

  const freeze6Days = await api
    .post(`/api/memberships/${m6.id}/freeze`)
    .set(auth())
    .send({ days: 6, startsOn: baseDay, reason: "Dưới biên 7 ngày" });
  assert.equal(freeze6Days.status, 400);
  assert.equal(freeze6Days.body.code, "FREEZE_MIN_7_DAYS");

  const freeze31Days = await api
    .post(`/api/memberships/${m6.id}/freeze`)
    .set(auth())
    .send({ days: 31, startsOn: baseDay, reason: "Vượt biên 30 ngày" });
  assert.equal(freeze31Days.status, 400);
  assert.equal(freeze31Days.body.code, "FREEZE_MAX_30_DAYS");

  // Out-of-bounds start date (after membership endsBefore)
  const afterEnd = plusDays(m6.endsBefore, 5);
  const freezeAfterEnd = await api
    .post(`/api/memberships/${m6.id}/freeze`)
    .set(auth())
    .send({ days: 7, startsOn: afterEnd, reason: "Ngoài hạn gói" });
  assert.equal(freezeAfterEnd.status, 400);
  assert.equal(freezeAfterEnd.body.code, "INVALID_START_DATE");

  // If time advances past m6.endsBefore, freeze must be rejected even if DB status was still ACTIVE
  setClock(afterEnd);
  const freezeExpired = await api
    .post(`/api/memberships/${m6.id}/freeze`)
    .set(auth())
    .send({ days: 7, startsOn: afterEnd, reason: "Gói đã quá hạn thực tế" });
  assert.equal(freezeExpired.status, 400);
  assert.equal(freezeExpired.body.code, "FREEZE_NOT_ELIGIBLE");
  setClock(baseDay);
});

test("UC05-03: concurrent freeze requests allow only one active freeze and shift SCHEDULED membership", async () => {
  setClock(baseDay);
  const member = await createMemberFixture();

  const activeM = await registerAndConfirm(
    member.id,
    pack6M.id,
    pack6M.price,
    baseDay,
  );
  const scheduledM = await registerAndConfirm(
    member.id,
    pack3M.id,
    pack3M.price,
    activeM.endsBefore,
  );
  assert.equal(scheduledM.status, "SCHEDULED");
  assert.equal(scheduledM.startsOn, activeM.endsBefore);

  // Fire 2 concurrent freeze requests (10 days starting today)
  const [r1, r2] = await Promise.all([
    api
      .post(`/api/memberships/${activeM.id}/freeze`)
      .set(auth())
      .send({ days: 10, startsOn: baseDay, reason: "Đợt 1 (10 ngày)" }),
    api
      .post(`/api/memberships/${activeM.id}/freeze`)
      .set(auth())
      .send({ days: 10, startsOn: baseDay, reason: "Đợt trùng lặp" }),
  ]);

  const statuses = [r1.status, r2.status].sort();
  assert.deepEqual(statuses, [200, 409]);
  const winner = r1.status === 200 ? r1.body : r2.body;
  assert.equal(winner.membership.status, "FROZEN");
  assert.equal(winner.membership.endsBefore, plusDays(activeM.endsBefore, 10));
  assert.equal(winner.membership.frozenDaysUsed, 10);
  assert.equal(
    winner.shiftedScheduledMembership.startsOn,
    plusDays(scheduledM.startsOn, 10),
  );
  assert.equal(
    winner.shiftedScheduledMembership.endsBefore,
    plusDays(scheduledM.endsBefore, 10),
  );
});

test("UC05-04: future freeze does not block today's check-in, activates on startsOn, and auto-ends on endsBefore", async () => {
  setClock(baseDay);
  const member = await createMemberFixture();
  const activeM = await registerAndConfirm(
    member.id,
    pack6M.id,
    pack6M.price,
    baseDay,
  );

  // Schedule a 7-day freeze starting 5 days in the future
  const futureStart = plusDays(baseDay, 5);
  const futureEnd = plusDays(baseDay, 12);
  const freezeRes = await api
    .post(`/api/memberships/${activeM.id}/freeze`)
    .set(auth(member.token))
    .send({
      days: 7,
      startsOn: futureStart,
      reason: "Về quê sau 5 ngày",
    });
  assert.equal(freezeRes.status, 200);
  // Status today must remain ACTIVE so workout rights are not blocked early!
  assert.equal(freezeRes.body.membership.status, "ACTIVE");
  assert.equal(freezeRes.body.membership.endsBefore, plusDays(activeM.endsBefore, 7));

  // Verify member CAN issue check-in QR today
  const qrToday = await api
    .post("/api/check-ins/qr")
    .set(auth(member.token))
    .send({});
  assert.equal(qrToday.status, 200);

  // Advance clock inside freeze window (baseDay + 6 days)
  setClock(plusDays(baseDay, 6));
  const qrDuringFreeze = await api
    .post("/api/check-ins/qr")
    .set(auth(member.token))
    .send({});
  assert.equal(qrDuringFreeze.status, 409);
  assert.equal(qrDuringFreeze.body.code, "MEMBERSHIP_FROZEN");

  const myDuringFreeze = await api
    .get("/api/memberships/my/detail")
    .set(auth(member.token));
  assert.equal(myDuringFreeze.status, 200);
  assert.equal(myDuringFreeze.body.activeMembership.status, "FROZEN");

  // Advance clock to futureEnd (freeze endsBefore reached -> auto-unfreeze!)
  setClock(futureEnd);
  const qrAfterFreeze = await api
    .post("/api/check-ins/qr")
    .set(auth(member.token))
    .send({});
  assert.equal(qrAfterFreeze.status, 200);

  const myAfterFreeze = await api
    .get("/api/memberships/my/detail")
    .set(auth(member.token));
  assert.equal(myAfterFreeze.status, 200);
  assert.equal(myAfterFreeze.body.activeMembership.status, "ACTIVE");
  assert.equal(
    myAfterFreeze.body.activeMembership.freezePeriods[0].status,
    "ENDED",
  );
  setClock(baseDay);
});

test("UC05-05: early unfreeze recalculates actual days used, refunds unused days, pulls back SCHEDULED membership, and enforces 30-day cumulative cap", async () => {
  setClock(baseDay);
  const member = await createMemberFixture();

  const activeM = await registerAndConfirm(
    member.id,
    pack6M.id,
    pack6M.price,
    baseDay,
  );
  const scheduledM = await registerAndConfirm(
    member.id,
    pack3M.id,
    pack3M.price,
    activeM.endsBefore,
  );

  // 1. Freeze for 20 days starting today
  const f1 = await api
    .post(`/api/memberships/${activeM.id}/freeze`)
    .set(auth())
    .send({ days: 20, startsOn: baseDay, reason: "Xin nghỉ 20 ngày" });
  assert.equal(f1.status, 200);
  assert.equal(f1.body.membership.endsBefore, plusDays(activeM.endsBefore, 20));
  assert.equal(
    f1.body.shiftedScheduledMembership.startsOn,
    plusDays(scheduledM.startsOn, 20),
  );

  // 2. Member returns early after 12 days -> unusedDays = 8
  const returnDay = plusDays(baseDay, 12);
  setClock(returnDay);
  const unfreeze = await api
    .post(`/api/memberships/${activeM.id}/unfreeze`)
    .set(auth())
    .send({});
  assert.equal(unfreeze.status, 200);
  assert.equal(unfreeze.body.membership.status, "ACTIVE");
  assert.equal(unfreeze.body.membership.frozenDaysUsed, 12);
  assert.equal(
    unfreeze.body.membership.endsBefore,
    plusDays(activeM.endsBefore, 12),
  );
  assert.equal(
    unfreeze.body.shiftedScheduledMembership.startsOn,
    plusDays(scheduledM.startsOn, 12),
  );
  assert.equal(
    unfreeze.body.shiftedScheduledMembership.endsBefore,
    plusDays(scheduledM.endsBefore, 12),
  );

  // 3. Cumulative quota check: 12 days used so far -> requesting 19 days (12 + 19 = 31 > 30) must fail
  const f2TooLong = await api
    .post(`/api/memberships/${activeM.id}/freeze`)
    .set(auth())
    .send({ days: 19, startsOn: returnDay, reason: "Vượt tổng 30 ngày" });
  assert.equal(f2TooLong.status, 400);
  assert.equal(f2TooLong.body.code, "FREEZE_MAX_30_DAYS");

  // Requesting 18 days (12 + 18 = 30 <= 30) succeeds!
  const f2Exact = await api
    .post(`/api/memberships/${activeM.id}/freeze`)
    .set(auth())
    .send({ days: 18, startsOn: returnDay, reason: "Đủ trần 30 ngày" });
  assert.equal(f2Exact.status, 200);
  assert.equal(f2Exact.body.membership.frozenDaysUsed, 30);
  setClock(baseDay);
});

test("UC05-06: internal PT session hold, consume and refund with compensation (PKG-06)", async () => {
  setClock(baseDay);
  const member = await createMemberFixture();
  const activeM = await registerAndConfirm(
    member.id,
    pack6M.id,
    pack6M.price,
    baseDay,
  );

  const svc = app.get(MembershipsService);
  // Initially 4 PT sessions
  const afterHold = await svc.holdPTSession(activeM.id);
  assert.equal(afterHold.ptSessionsRemaining, 3);

  const afterConsume = await svc.consumePTSession(activeM.id);
  assert.equal(afterConsume.ptSessionsRemaining, 3);

  // Normal refund (+1)
  const afterRefund = await svc.refundPTSession(activeM.id, false);
  assert.equal(afterRefund.ptSessionsRemaining, 4);

  // Hold again -> 3, then late PT cancel refund with compensation (+2 -> 5, snapshot expands to 5)
  await svc.holdPTSession(activeM.id);
  const afterCompensated = await svc.refundPTSession(activeM.id, true);
  assert.equal(afterCompensated.ptSessionsRemaining, 5);
  assert.equal(afterCompensated.ptSessionsSnapshot, 5);
});

