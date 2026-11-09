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
import { addMonths } from "../src/modules/sales/sales.service";
for (const value of [process.env.DATABASE_URL, process.env.DIRECT_URL]) {
  const u = new URL(value || "postgresql://invalid/invalid");
  if (
    !["localhost", "127.0.0.1"].includes(u.hostname) ||
    u.pathname != "/fithub_test"
  )
    throw Error("Sales tests require isolated fithub_test.");
}
const db = new PrismaClient();
let app: Awaited<ReturnType<typeof NestFactory.create>>,
  api: ReturnType<typeof request>,
  adminToken: string,
  adminId: string,
  hash: string,
  pack: { id: string; price: number };
const day = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const auth = (token = adminToken) => ({ Authorization: `Bearer ${token}` });
async function token(userId: string, platform: "WEB" | "MOBILE" = "WEB") {
  const value = randomUUID() + randomUUID();
  await db.session.create({
    data: {
      userId,
      tokenHash: createHash("sha256").update(value).digest("hex"),
      deviceId: randomUUID(),
      requestId: randomUUID(),
      platform,
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  return value;
}
async function fixture(status: "ACTIVE" | "PENDING_VERIFY" = "ACTIVE") {
  const u = await db.user.create({
    data: {
      email: `sales-${randomUUID()}@example.com`,
      displayName: "Hội viên bán gói",
      role: "MEMBER",
      status,
      verifiedAt: status === "ACTIVE" ? new Date() : null,
      passwordHash: hash,
    },
  });
  const m = await db.memberProfile.create({
    data: { userId: u.id, memberCode: `SALES-${randomUUID()}` },
  });
  return { ...m, token: await token(u.id, "MOBILE") };
}
const body = (startsOn = day) => ({
  requestId: randomUUID(),
  packageId: pack.id,
  startsOn,
  expectedPrice: pack.price,
});
const register = (id: string, b = body()) =>
  api.post(`/api/members/${id}/memberships`).set(auth()).send(b);
const confirm = (p: { id: string; amount: number }, key = randomUUID()) =>
  api
    .post(`/api/payments/${p.id}/confirm`)
    .set(auth())
    .send({ idempotencyKey: key, amount: p.amount });
before(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  api = request(app.getHttpServer());
  app.get(CheckInsService).now = () => new Date(`${day}T03:00:00Z`);
  hash = await hashPassword("SalesTest!2026");
  const admin = await db.user.create({
    data: {
      email: `sales-admin-${randomUUID()}@example.com`,
      displayName: "Admin sales test",
      role: "ADMIN",
      status: "ACTIVE",
      verifiedAt: new Date(),
      passwordHash: hash,
    },
  });
  adminId = admin.id;
  adminToken = await token(admin.id);
  const p = await db.package.create({
    data: {
      code: `SALES-${randomUUID()}`,
      name: "Gym sales test",
      durationMonths: 1,
      price: 100000,
      grantsGymAccess: true,
    },
  });
  pack = { id: p.id, price: Number(p.price) };
});
after(async () => {
  await app?.close();
  await db.$disconnect();
});
test("DB sales 01: roles, auth, UUID validation and missing invoice", async () => {
  assert.equal((await api.get("/api/dashboard")).status, 401);
  const m = await fixture();
  assert.equal(
    (await api.get("/api/dashboard").set(auth(m.token))).status,
    403,
  );
  assert.equal(
    (await api.get(`/api/members/${m.id}/purchase-options`).set(auth(m.token)))
      .status,
    403,
  );
  assert.equal(
    (await api.get(`/api/payments/${randomUUID()}`).set(auth())).status,
    404,
  );
  assert.equal(
    (await register(m.id, { ...body(), packageId: "bad" })).status,
    400,
  );
  assert.equal((await api.get("/api/payments?page=0").set(auth())).status, 400);
  assert.equal((await register(randomUUID())).status, 404);
});
test("DB sales 02: pending order persisted once, cannot use QR; concurrent confirmation atomically activates once", async () => {
  const f = await fixture(),
    b = body();
  const rs = await Promise.all([register(f.id, b), register(f.id, b)]);
  assert.equal(rs[0].status, 201);
  assert.deepEqual(rs[0].body, rs[1].body);
  const p = rs[0].body;
  assert.equal(p.status, "PENDING");
  assert.equal(p.membership.status, "PENDING_PAYMENT");
  assert.match(p.code, /^GD\d+$/);
  assert.match(p.membership.code, /^DK\d+$/);
  assert.equal(
    (await api.post("/api/check-ins/qr").set(auth(f.token))).body.code,
    "PAYMENT_PENDING",
  );
  const key = randomUUID();
  const confirms = await Promise.all([confirm(p, key), confirm(p, key)]);
  assert.equal(confirms[0].status, 200);
  assert.deepEqual(confirms[0].body, confirms[1].body);
  assert.equal(confirms[0].body.membership.status, "ACTIVE");
  assert.equal(
    await db.payment.count({ where: { membership: { memberId: f.id } } }),
    1,
  );
  assert.equal(
    await db.auditLog.count({
      where: { entityId: p.id, action: "PAYMENT_CONFIRM" },
    }),
    1,
  );
  const qr = await api.post("/api/check-ins/qr").set(auth(f.token));
  assert.equal(qr.status, 200);
  assert.equal(
    (await api.get(`/api/payments/${p.id}`).set(auth())).body.status,
    "CONFIRMED",
  );
});
test("DB sales 03: price changes, inactive catalogue, invalid dates and unverified members do not create orders", async () => {
  const f = await fixture(),
    pending = await fixture("PENDING_VERIFY");
  assert.equal((await register(pending.id)).body.code, "MEMBER_NOT_ELIGIBLE");
  assert.equal(
    (await register(f.id, { ...body(), expectedPrice: 1 })).body.code,
    "PRICE_CHANGED",
  );
  assert.equal(
    (await register(f.id, { ...body(), startsOn: "2026-02-31" })).body.code,
    "INVALID_START_DATE",
  );
  const p = await db.package.create({
    data: {
      code: randomUUID(),
      name: "Disabled",
      durationMonths: 1,
      price: 1000,
      isActive: false,
    },
  });
  assert.equal(
    (await register(f.id, { ...body(), packageId: p.id, expectedPrice: 1000 }))
      .body.code,
    "PACKAGE_UNAVAILABLE",
  );
  assert.equal(await db.membership.count({ where: { memberId: f.id } }), 0);
});
test("DB sales 04: overlap blocked and renewal starts at previous exclusive end without changing old membership", async () => {
  const f = await fixture();
  const first = (await register(f.id)).body;
  assert.equal((await confirm(first)).status, 200);
  assert.equal((await register(f.id)).body.code, "MEMBERSHIP_OVERLAP");
  const options = await api
    .get(`/api/members/${f.id}/purchase-options`)
    .set(auth());
  assert.equal(options.body.suggestedStartsOn, first.membership.endsBefore);
  const renewal = (await register(f.id, body(options.body.suggestedStartsOn)))
    .body;
  const confirmed = await confirm(renewal);
  assert.equal(confirmed.body.membership.status, "SCHEDULED");
  assert.equal(
    (
      await db.membership.findUniqueOrThrow({
        where: { id: first.membership.id },
      })
    ).endsBefore
      .toISOString()
      .slice(0, 10),
    first.membership.endsBefore,
  );
});
test("DB sales 05: cancellation retained, replay is safe, cancelled invoices cannot activate", async () => {
  const f = await fixture(),
    p = (await register(f.id)).body;
  const cancel = () =>
    api.post(`/api/payments/${p.id}/cancel`).set(auth()).send({});
  assert.equal((await cancel()).body.status, "CANCELLED");
  assert.equal((await cancel()).body.membership.status, "CANCELLED");
  assert.equal((await confirm(p)).body.code, "PAYMENT_CANCELLED");
  assert.equal(
    await db.auditLog.count({
      where: { entityId: p.id, action: "PAYMENT_CANCEL" },
    }),
    1,
  );
  assert.equal((await register(f.id)).status, 201);
});
test("DB sales 06: wrong amount and deactivated account roll back both payment and entitlement", async () => {
  const f = await fixture(),
    p = (await register(f.id)).body;
  assert.equal(
    (await confirm({ ...p, amount: 1 })).body.code,
    "AMOUNT_MISMATCH",
  );
  await db.user.update({
    where: { id: f.userId },
    data: { status: "DEACTIVATED" },
  });
  assert.equal((await confirm(p)).body.code, "MEMBER_NOT_ELIGIBLE");
  const saved = await db.payment.findUniqueOrThrow({
    where: { id: p.id },
    include: { membership: true },
  });
  assert.equal(saved.status, "PENDING");
  assert.equal(saved.membership.status, "PENDING_PAYMENT");
  assert.equal(saved.confirmedAt, null);
});
test("DB sales 07: concurrent registrations have unique codes; shared confirmation key cannot charge two invoices", async () => {
  const f1 = await fixture(),
    f2 = await fixture();
  const orders = await Promise.all([register(f1.id), register(f2.id)]);
  orders.forEach((r) => assert.equal(r.status, 201));
  assert.notEqual(orders[0].body.code, orders[1].body.code);
  const key = randomUUID(),
    r = await Promise.all(orders.map((o) => confirm(o.body, key)));
  assert.deepEqual(r.map((x) => x.status).sort(), [200, 409]);
  const saved = await db.payment.findMany({
    where: { id: { in: orders.map((o) => o.body.id) } },
    include: { membership: true },
  });
  assert.equal(saved.filter((p) => p.status === "CONFIRMED").length, 1);
  assert.equal(
    saved.filter((p) => p.membership.status === "PENDING_PAYMENT").length,
    1,
  );
});
test("DB sales 08: dashboard and server-filtered history agree with persisted database", async () => {
  const f = await fixture(),
    p = (await register(f.id)).body;
  await confirm(p);
  const list = await api
    .get(`/api/payments?member=${f.id}&status=CONFIRMED&pageSize=1`)
    .set(auth());
  assert.equal(list.body.total, 1);
  assert.equal(list.body.items[0].id, p.id);
  const search = await api.get(`/api/payments?q=${p.code}`).set(auth());
  assert.equal(search.body.items[0].id, p.id);
  const report = await api.get("/api/dashboard").set(auth());
  assert.equal(report.status, 200);
  assert.equal(report.body.day, day);
  const start = new Date(`${day}T00:00:00+07:00`),
    end = new Date(start.getTime() + 86400000);
  const sum = await db.payment.aggregate({
    where: {
      status: "CONFIRMED",
      code: { not: { startsWith: "GD-TESTQR-" } },
      confirmedAt: { gte: start, lt: end },
    },
    _sum: { amount: true },
  });
  assert.equal(report.body.revenueToday, Number(sum._sum.amount || 0));
  assert.equal(
    (await api.post(`/api/payments/${p.id}/cancel`).set(auth())).body.code,
    "ALREADY_CONFIRMED",
  );
});
test("DB sales 09: end dates clamp at calendar month ends including leap years", () => {
  assert.equal(
    addMonths("2027-01-31", 1).toISOString().slice(0, 10),
    "2027-02-28",
  );
  assert.equal(
    addMonths("2028-01-31", 1).toISOString().slice(0, 10),
    "2028-02-29",
  );
});

test("Dashboard: selected dates, Vietnam boundaries, zero-filled ranges and invalid queries", async () => {
  for (const [selected, range, length] of [
    ["2026-03-01", "7d", 7],
    ["2026-03-01", "30d", 30],
    ["2024-02-29", "month", 29],
  ] as const) {
    const response = await api
      .get(`/api/dashboard?date=${selected}&range=${range}`)
      .set(auth())
      .expect(200);
    const report = response.body;
    assert.equal(report.day, selected);
    assert.equal(report.checkInSeries.length, length);
    assert.equal(report.checkInSeries.at(-1).date, selected);
    const start = new Date(`${selected}T00:00:00+07:00`);
    const end = new Date(start.getTime() + 86400000);
    assert.equal(
      report.checkInsToday,
      await db.checkInRecord.count({
        where: { checkedInAt: { gte: start, lt: end } },
      }),
    );
    assert.equal(
      report.newMembers,
      await db.memberProfile.count({
        where: { createdAt: { gte: start, lt: end } },
      }),
    );
    for (const point of report.checkInSeries) {
      const from = new Date(`${point.date}T00:00:00+07:00`);
      assert.equal(
        point.count,
        await db.checkInRecord.count({
          where: {
            checkedInAt: { gte: from, lt: new Date(from.getTime() + 86400000) },
          },
        }),
      );
    }
  }
  for (const query of [
    "date=2026-02-30",
    "date=invalid",
    "date=9999-01-01",
    "range=year",
    "date=",
    "range=",
  ]) {
    const r = await api.get(`/api/dashboard?${query}`).set(auth()).expect(400);
    assert.equal(r.body.code, "INVALID_DASHBOARD_QUERY");
  }
});

test("Dashboard: Vietnam midnight includes start and excludes next day", async () => {
  const f = await fixture();
  const order = (await register(f.id)).body;
  await confirm(order);
  const scanner = await api
    .post("/api/check-ins/scanners")
    .set(auth())
    .send({ deviceId: randomUUID(), label: "Dashboard boundary test" })
    .expect(200);
  const selected = "2024-02-29";
  const start = new Date(`${selected}T00:00:00+07:00`);
  const end = new Date(start.getTime() + 86400000);
  const before = await api
    .get(`/api/dashboard?date=${selected}`)
    .set(auth())
    .expect(200);
  for (const checkedInAt of [
    new Date(start.getTime() - 1),
    start,
    new Date(end.getTime() - 1),
    end,
  ]) {
    await db.checkInTransaction.create({
      data: {
        id: randomUUID(),
        scannerId: scanner.body.id,
        payloadHash: "dashboard-test",
        result: { accepted: true },
        record: {
          create: {
            memberId: f.id,
            membershipId: order.membership.id,
            checkedInAt,
          },
        },
      },
    });
  }
  const after = await api
    .get(`/api/dashboard?date=${selected}`)
    .set(auth())
    .expect(200);
  assert.equal(after.body.checkInsToday, before.body.checkInsToday + 2);
  assert.equal(
    after.body.checkInSeries.at(-1).count,
    before.body.checkInSeries.at(-1).count + 2,
  );
});
