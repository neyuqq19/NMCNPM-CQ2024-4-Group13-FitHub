import "reflect-metadata";
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { PrismaClient, type MembershipStatus } from "@prisma/client";
import request from "supertest";
import { hashPassword } from "../src/modules/auth/password";
import { AppModule } from "../src/app.module";
import { CheckInsService } from "../src/modules/check-ins/check-ins.service";
import { AllExceptionsFilter } from "../src/common/filters/http-exception.filter";
const url = new URL(process.env.DATABASE_URL || "postgresql://invalid/invalid");
const direct = new URL(process.env.DIRECT_URL || url.toString());
if (
  [url, direct].some(
    (u) =>
      !["localhost", "127.0.0.1"].includes(u.hostname) ||
      u.pathname != "/fithub_test",
  )
)
  throw Error("UC03 requires isolated fithub_test.");
const db = new PrismaClient();
let app: Awaited<ReturnType<typeof NestFactory.create>>;
let api: ReturnType<typeof request>;
let svc: CheckInsService;
const day = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const baseline = () => new Date(`${day}T03:00:00Z`); // 10:00 in Vietnam, within both windows.
let clock = baseline();
let passwordHash: string;
let adminId: string,
  adminToken: string,
  adminSessionId: string,
  scannerId: string;
const headers = (token: string) => ({ Authorization: `Bearer ${token}` });
async function session(userId: string, platform: "WEB" | "MOBILE") {
  const token = randomUUID() + randomUUID();
  const row = await db.session.create({
    data: {
      userId,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      requestId: randomUUID(),
      deviceId: randomUUID(),
      platform,
      expiresAt: new Date(Date.now() + 7 * 86400_000),
    },
  });
  return { token, id: row.id };
}
async function member(
  options: {
    status?: MembershipStatus;
    window?: "REGULAR" | "OFF_PEAK";
    grants?: boolean;
    offset?: number;
    none?: boolean;
    paid?: boolean;
  } = {},
) {
  const u = await db.user.create({
    data: {
      email: `uc03-${randomUUID()}@example.com`,
      displayName: "Hội viên UC03",
      passwordHash,
      role: "MEMBER",
      status: "ACTIVE",
      verifiedAt: new Date(),
    },
  });
  const p = await db.memberProfile.create({
    data: { userId: u.id, memberCode: `UC03-${randomUUID()}` },
  });
  const s = await session(u.id, "MOBILE");
  let membershipId: string | undefined;
  if (!options.none) {
    const pack = await db.package.create({
      data: {
        code: randomUUID(),
        name: "Gym UC03",
        durationMonths: 1,
        price: 500000,
        grantsGymAccess: options.grants ?? true,
        accessWindow: options.window ?? "REGULAR",
      },
    });
    const start = new Date(`${day}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() + (options.offset ?? -1));
    const end = new Date(start.getTime() + 30 * 86400_000);
    const paid = options.paid ?? options.status !== "PENDING_PAYMENT";
    const m = await db.$transaction(async (tx) => {
      const row = await tx.membership.create({
        data: {
          code: randomUUID(),
          requestId: randomUUID(),
          memberId: p.id,
          packageId: pack.id,
          packageNameSnapshot: pack.name,
          priceSnapshot: pack.price,
          durationMonthsSnapshot: 1,
          grantsGymAccessSnapshot: pack.grantsGymAccess,
          startsOn: start,
          endsBefore: end,
          status: options.status ?? "ACTIVE",
        },
      });
      if (paid)
        await tx.payment.create({
          data: {
            code: randomUUID(),
            membershipId: row.id,
            amount: 500000,
            idempotencyKey: randomUUID(),
            status: "CONFIRMED",
            confirmedById: adminId,
            confirmedAt: clock,
          },
        });
      return row;
    });
    membershipId = m.id;
  }
  return { u, p, s, membershipId };
}
async function issue(token: string) {
  return api.post("/api/check-ins/qr").set(headers(token));
}
function scan(payload: string, id = randomUUID(), scanner = scannerId) {
  return api
    .post("/api/check-ins/scan")
    .set(headers(adminToken))
    .send({ payload, requestId: id, scannerId: scanner });
}
before(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  api = request(app.getHttpServer());
  svc = app.get(CheckInsService);
  svc.now = () => clock;
  passwordHash = await hashPassword("UC03Test!2026");
  const u = await db.user.create({
    data: {
      email: `uc03-admin-${randomUUID()}@example.com`,
      displayName: "Quầy UC03",
      passwordHash,
      role: "ADMIN",
      status: "ACTIVE",
      verifiedAt: new Date(),
    },
  });
  adminId = u.id;
  const s = await session(u.id, "WEB");
  adminToken = s.token;
  adminSessionId = s.id;
  const reg = await api
    .post("/api/check-ins/scanners")
    .set(headers(adminToken))
    .send({ deviceId: randomUUID(), label: "Quầy test" });
  assert.equal(reg.status, 200);
  scannerId = reg.body.id;
});
after(async () => {
  await app?.close();
  await db.$disconnect();
});

test("UC03-01: real signed QR, accepted record, mobile status and exact replay", async () => {
  clock = baseline();
  const f = await member();
  const q = await issue(f.s.token);
  assert.equal(q.status, 200);
  assert.match(q.body.payload, /^FH1\./);
  assert.ok(!q.body.payload.includes(f.s.token));
  assert.equal(
    Date.parse(q.body.expiresAt) - Date.parse(q.body.serverNow),
    20000,
  );
  const id = randomUUID();
  const r = await scan(q.body.payload, id);
  assert.equal(r.status, 200);
  assert.equal(r.body.accepted, true);
  assert.equal(r.body.member.id, f.p.id);
  const retry = await scan(q.body.payload, id);
  assert.deepEqual(retry.body, r.body);
  assert.equal(
    await db.checkInRecord.count({ where: { memberId: f.p.id } }),
    1,
  );
  const status = await api
    .get(`/api/check-ins/qr/${q.body.id}/status`)
    .set(headers(f.s.token));
  assert.equal(status.body.result.requestId, id);
  const lookup = await api
    .get(`/api/check-ins/transactions/${id}`)
    .set(headers(adminToken));
  assert.deepEqual(lookup.body, r.body);
  const conflict = await scan("different", id);
  assert.equal(conflict.status, 409);
});
test("UC03-02: two scanners racing admit once, cooldown across scanners and exact 10-minute boundary", async () => {
  clock = baseline();
  const f = await member();
  const q = await issue(f.s.token);
  const second = await api
    .post("/api/check-ins/scanners")
    .set(headers(adminToken))
    .send({ deviceId: randomUUID(), label: "Quầy 2" });
  const results = await Promise.all([
    scan(q.body.payload),
    scan(q.body.payload, randomUUID(), second.body.id),
  ]);
  assert.equal(results.filter((r) => r.body.accepted).length, 1);
  assert.equal(
    results.filter((r) => r.body.code === "CHECKIN_COOLDOWN").length,
    1,
  );
  assert.equal(
    await db.checkInRecord.count({ where: { memberId: f.p.id } }),
    1,
  );
  clock = new Date(baseline().getTime() + 599999);
  assert.equal((await issue(f.s.token)).body.code, "CHECKIN_COOLDOWN");
  clock = new Date(baseline().getTime() + 600000);
  const next = await issue(f.s.token);
  assert.equal(next.status, 200);
  assert.equal((await scan(next.body.payload)).body.accepted, true);
});
test("UC03-03: expired/forged QR creates no admission, reissue rotates at 20 seconds", async () => {
  clock = baseline();
  const f = await member();
  const q = await issue(f.s.token);
  const forged = await scan(
    q.body.payload.slice(0, -1) + (q.body.payload.endsWith("a") ? "b" : "a"),
  );
  assert.equal(forged.body.code, "QR_INVALID");
  clock = new Date(baseline().getTime() + 20000);
  assert.equal((await scan(q.body.payload)).body.code, "QR_EXPIRED");
  const next = await issue(f.s.token);
  assert.notEqual(next.body.id, q.body.id);
  assert.equal(
    await db.checkInRecord.count({ where: { memberId: f.p.id } }),
    0,
  );
});
for (const [name, options, code] of [
  ["no package", { none: true }, "NO_MEMBERSHIP"],
  [
    "pending payment",
    { status: "PENDING_PAYMENT", paid: false },
    "PAYMENT_PENDING",
  ],
  [
    "future package",
    { status: "SCHEDULED", offset: 1 },
    "MEMBERSHIP_SCHEDULED",
  ],
  ["expired package", { status: "EXPIRED", offset: -40 }, "MEMBERSHIP_EXPIRED"],
  ["frozen package", { status: "FROZEN" }, "MEMBERSHIP_FROZEN"],
  ["no gym access", { grants: false }, "NO_GYM_ACCESS"],
] as const)
  test(`UC03-04: ${name} cannot issue a QR`, async () => {
    clock = baseline();
    const f = await member(options);
    const q = await issue(f.s.token);
    assert.equal(q.status, 409);
    assert.equal(q.body.code, code);
  });
test("UC03-05: scan rechecks newly frozen entitlement and retained history", async () => {
  clock = baseline();
  const f = await member();
  const q = await issue(f.s.token);
  await db.membership.update({
    where: { id: f.membershipId },
    data: { status: "FROZEN", version: { increment: 1 } },
  });
  assert.equal((await scan(q.body.payload)).body.code, "MEMBERSHIP_FROZEN");
  assert.equal(
    await db.checkInRecord.count({ where: { memberId: f.p.id } }),
    0,
  );
  assert.equal(
    await db.payment.count({
      where: { membershipId: f.membershipId, status: "CONFIRMED" },
    }),
    1,
  );
});
test("UC03-06: off-peak boundaries 09:00 inclusive, 16:00 exclusive; regular 05:30 to 22:00", async () => {
  const f = await member({ window: "OFF_PEAK" });
  for (const [time, ok] of [
    ["01:59:59", false],
    ["02:00:00", true],
    ["08:59:59", true],
    ["09:00:00", false],
  ] as const) {
    clock = new Date(`${day}T${time}Z`);
    assert.equal((await issue(f.s.token)).status, ok ? 200 : 409);
  }
  const regular = await member();
  for (const [time, ok] of [
    ["22:29:59", false],
    ["22:30:00", true],
    ["14:59:59", true],
    ["15:00:00", false],
  ] as const) {
    // 05:30 Vietnam is 22:30 UTC on the previous day.
    clock = new Date(`${day}T${time}Z`);
    if (time.startsWith("22")) clock = new Date(clock.getTime() - 86400_000);
    assert.equal((await issue(regular.s.token)).status, ok ? 200 : 409);
  }
});
test("UC03-07: revoked member session/account and disabled scanner reject admission", async () => {
  clock = baseline();
  const f = await member();
  const q = await issue(f.s.token);
  await db.session.update({
    where: { id: f.s.id },
    data: { revokedAt: clock },
  });
  assert.equal(
    (await scan(q.body.payload)).body.code,
    "MEMBER_SESSION_INVALID",
  );
  assert.equal((await issue(f.s.token)).status, 401);
  const f2 = await member();
  const q2 = await issue(f2.s.token);
  const deactivated = await api
    .post(`/api/members/${f2.p.id}/deactivate`)
    .set(headers(adminToken))
    .send({ version: 0, reason: "UC03 ngừng sử dụng" });
  assert.equal(deactivated.status, 201);
  assert.equal(
    (await scan(q2.body.payload)).body.code,
    "MEMBER_SESSION_INVALID",
  );
  await db.checkInScanner.update({
    where: { id: scannerId },
    data: { enabled: false },
  });
  assert.equal((await scan(q.body.payload)).status, 403);
  const register = await api
    .post("/api/check-ins/scanners")
    .set(headers(adminToken))
    .send({
      deviceId: (
        await db.checkInScanner.findUniqueOrThrow({ where: { id: scannerId } })
      ).deviceId,
      label: "Bypass",
    });
  assert.equal(register.status, 403);
  await db.checkInScanner.update({
    where: { id: scannerId },
    data: { enabled: true },
  });
});
test("UC03-08: auth, roles, validation, QR ownership and unknown transaction", async () => {
  clock = baseline();
  const f = await member();
  const other = await member();
  const q = await issue(f.s.token);
  assert.equal((await api.post("/api/check-ins/qr")).status, 401);
  assert.equal((await issue(adminToken)).status, 403);
  assert.equal(
    (
      await api
        .post("/api/check-ins/scan")
        .set(headers(f.s.token))
        .send({ scannerId, requestId: randomUUID(), payload: q.body.payload })
    ).status,
    403,
  );
  assert.equal(
    (
      await api
        .get(`/api/check-ins/qr/${q.body.id}/status`)
        .set(headers(other.s.token))
    ).status,
    404,
  );
  assert.equal(
    (
      await api
        .get(`/api/check-ins/transactions/${randomUUID()}`)
        .set(headers(adminToken))
    ).status,
    404,
  );
  assert.equal(
    (
      await api
        .post("/api/check-ins/scan")
        .set(headers(adminToken))
        .send({ scannerId: "bad", payload: q.body.payload })
    ).status,
    400,
  );
  assert.equal(
    (await scan(q.body.payload, randomUUID(), randomUUID())).status,
    403,
  );
});
test("UC03-09: future purchase cannot hide current package; choose earliest end then UUID", async () => {
  clock = baseline();
  const f = await member();
  const current = await db.membership.findUniqueOrThrow({
    where: { id: f.membershipId },
  });
  await db.$transaction(async (tx) => {
    const future = await tx.membership.create({
      data: {
        memberId: f.p.id,
        packageId: current.packageId,
        code: randomUUID(),
        requestId: randomUUID(),
        packageNameSnapshot: "Future package",
        priceSnapshot: 500000,
        durationMonthsSnapshot: 1,
        grantsGymAccessSnapshot: true,
        status: "SCHEDULED",
        startsOn: new Date(
          new Date(`${day}T00:00:00Z`).getTime() + 31 * 86400_000,
        ),
        endsBefore: new Date(
          new Date(`${day}T00:00:00Z`).getTime() + 61 * 86400_000,
        ),
      },
    });
    await tx.payment.create({
      data: {
        code: randomUUID(),
        membershipId: future.id,
        amount: 500000,
        idempotencyKey: randomUUID(),
        status: "CONFIRMED",
        confirmedById: adminId,
        confirmedAt: clock,
      },
    });
  });
  const q = await issue(f.s.token);
  assert.equal(q.body.membership.id, current.id);
  const summary = await api.get("/api/auth/membership").set(headers(f.s.token));
  assert.equal(summary.body.membershipCode, current.code);
});
test("UC03-10: concurrent same request and uncertain response lookup do not duplicate admission", async () => {
  clock = baseline();
  const f = await member();
  const q = await issue(f.s.token);
  const id = randomUUID();
  const rs = await Promise.all([
    scan(q.body.payload, id),
    scan(q.body.payload, id),
  ]);
  assert.deepEqual(rs[0].body, rs[1].body);
  assert.equal(
    await db.checkInRecord.count({ where: { transactionId: id } }),
    1,
  );
  // A successful decision remains queryable even when that QR has expired.
  clock = new Date(baseline().getTime() + 21000);
  const status = await api
    .get(`/api/check-ins/qr/${q.body.id}/status`)
    .set(headers(f.s.token));
  assert.equal(status.body.result.accepted, true);
  assert.deepEqual((await scan(q.body.payload, id)).body, rs[0].body);
});

test("UC03-11: member session expiry and replacement login invalidate previously issued QR", async () => {
  clock = baseline();
  const f = await member();
  const q = await issue(f.s.token);
  await db.session.update({
    where: { id: f.s.id },
    data: { expiresAt: new Date(Date.now() + 1000) },
  });
  clock = new Date(Date.now() + 2000);
  assert.equal((await issue(f.s.token)).status, 401);
  assert.equal(
    (await scan(q.body.payload)).body.code,
    "MEMBER_SESSION_INVALID",
  );
  clock = baseline();
  const f2 = await member();
  const q2 = await issue(f2.s.token);
  const login = await api.post("/api/auth/login").send({
    identifier: f2.u.email,
    password: "UC03Test!2026",
    platform: "MOBILE",
    deviceId: randomUUID(),
    requestId: randomUUID(),
  });
  assert.equal(login.status, 200);
  assert.equal(
    (await scan(q2.body.payload)).body.code,
    "MEMBER_SESSION_INVALID",
  );
});

test("UC03-12: concurrent QR requests reuse one period; purchased hour policy remains immutable", async () => {
  clock = baseline();
  const f = await member({ window: "OFF_PEAK" });
  const issued = await Promise.all([issue(f.s.token), issue(f.s.token)]);
  assert.equal(issued[0].status, 200);
  assert.equal(issued[1].status, 200);
  assert.equal(issued[0].body.id, issued[1].body.id);
  const row = await db.membership.findUniqueOrThrow({
    where: { id: f.membershipId },
  });
  assert.equal(row.accessWindowSnapshot, "OFF_PEAK");
  await assert.rejects(
    db.membership.update({
      where: { id: f.membershipId },
      data: { accessWindowSnapshot: "REGULAR" },
    }),
    /Purchased membership terms/,
  );
  await db.package.update({
    where: { id: row.packageId },
    data: { accessWindow: "REGULAR" },
  });
  assert.equal(
    (await db.membership.findUniqueOrThrow({ where: { id: row.id } }))
      .accessWindowSnapshot,
    "OFF_PEAK",
  );
});

test("Mobile summary: own check-ins, weekly counts and access control", async () => {
  clock = baseline();
  const m = await member();
  const other = await member();
  await api.get("/api/check-ins/my/summary").expect(401);
  await api
    .get("/api/check-ins/my/summary")
    .set(headers(adminToken))
    .expect(403);
  const empty = await api
    .get("/api/check-ins/my/summary")
    .set(headers(m.s.token))
    .expect(200);
  assert.equal(empty.body.sessionsThisMonth, 0);
  assert.equal(empty.body.week.length, 7);
  const scanner = await api
    .post("/api/check-ins/scanners")
    .set(headers(adminToken))
    .send({ deviceId: randomUUID(), label: "Summary" });
  const qr = await issue(m.s.token);
  await api
    .post("/api/check-ins/scan")
    .set(headers(adminToken))
    .send({
      scannerId: scanner.body.id,
      requestId: randomUUID(),
      payload: qr.body.payload,
    })
    .expect(200);
  const result = await api
    .get("/api/check-ins/my/summary")
    .set(headers(m.s.token))
    .expect(200);
  assert.equal(result.body.sessionsThisMonth, 1);
  assert.equal(
    result.body.week.reduce(
      (n: number, d: { count: number }) => n + d.count,
      0,
    ),
    1,
  );
  const isolated = await api
    .get("/api/check-ins/my/summary")
    .set(headers(other.s.token))
    .expect(200);
  assert.equal(isolated.body.sessionsThisMonth, 0);
});
