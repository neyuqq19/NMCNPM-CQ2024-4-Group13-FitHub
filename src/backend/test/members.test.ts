import "reflect-metadata";
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { AllExceptionsFilter } from "../src/common/filters/http-exception.filter";
import { hashPassword } from "../src/modules/auth/password";

const url = new URL(process.env.DATABASE_URL || "postgresql://invalid/invalid");
if (
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  url.pathname !== "/fithub_test"
)
  throw new Error("Requires isolated fithub_test.");
const db = new PrismaClient();
let app: Awaited<ReturnType<typeof NestFactory.create>>;
let api: ReturnType<typeof request>;
let adminId: string, token: string, trainerToken: string;
const suffix = randomUUID();
const password = "FitHubTest!2026";
const email = `admin-${suffix}@example.com`;
const users: string[] = [];
const auth = () => `Bearer ${token}`;
const uniqueEmail = () => `uc04-${randomUUID()}@example.com`;
async function login(identifier: string, platform = "WEB") {
  return api.post("/api/auth/login").send({
    identifier,
    password,
    platform,
    deviceId: randomUUID(),
    requestId: randomUUID(),
  });
}
before(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  await app.init();
  api = request(app.getHttpServer());
  const passwordHash = await hashPassword(password);
  for (const role of ["ADMIN", "TRAINER"] as const) {
    const user = await db.user.create({
      data: {
        email: role === "ADMIN" ? email : `trainer-${suffix}@example.com`,
        displayName: "UC04 test",
        passwordHash,
        status: "ACTIVE",
        verifiedAt: new Date(),
        role,
      },
    });
    users.push(user.id);
    const res = await login(user.email!);
    assert.equal(res.status, 200);
    if (role === "ADMIN") {
      token = res.body.accessToken;
      adminId = user.id;
    } else trainerToken = res.body.accessToken;
  }
});
after(async () => {
  // Delete only this run's fixtures; never truncate the database.
  const audit = await db.auditLog.findMany({
    where: { actorId: adminId },
    select: { entityId: true },
  });
  const profiles = await db.memberProfile.findMany({
    where: { id: { in: audit.map((a) => a.entityId) } },
  });
  users.push(...profiles.map((p) => p.userId));
  await db.auditLog.deleteMany({ where: { actorId: adminId } });
  await db.memberProfile.deleteMany({
    where: { id: { in: profiles.map((p) => p.id) } },
  });
  await db.user.deleteMany({ where: { id: { in: [...new Set(users)] } } });
  await app.close();
  await db.$disconnect();
});

test("UC04-01: auth, role, pagination, search and 404", async () => {
  assert.equal((await api.get("/api/members")).status, 401);
  assert.equal(
    (
      await api
        .get("/api/members")
        .set("Authorization", `Bearer ${trainerToken}`)
    ).status,
    403,
  );
  assert.equal(
    (await api.get("/api/members?page=0").set("Authorization", auth())).status,
    400,
  );
  const res = await api
    .get("/api/members?q=not-found-" + suffix)
    .set("Authorization", auth());
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 0);
  assert.equal(res.body.pageSize, 20);
  assert.equal(
    (await api.get("/api/members/" + randomUUID()).set("Authorization", auth()))
      .status,
    404,
  );
});
test("UC04-02: validation and canonical pending account persisted", async () => {
  const invalid = await api
    .post("/api/members")
    .set("Authorization", auth())
    .send({ displayName: "New" });
  assert.equal(invalid.status, 400);
  assert.ok(invalid.body.fieldErrors.contact);
  const email = uniqueEmail();
  const created = await api
    .post("/api/members")
    .set("Authorization", auth())
    .send({
      displayName: "  Nguyễn Hội Viên  ",
      email: `  ${email.toUpperCase()} `,
      injuryHistory: null,
    });
  assert.equal(created.status, 201);
  assert.equal(created.body.accountStatus, "PENDING_VERIFY");
  assert.equal(created.body.email, email);
  assert.equal(created.body.injuryHistory, null);
  assert.equal("passwordHash" in created.body, false);
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  assert.equal(user.passwordHash, null);
  assert.equal(user.verifiedAt, null);
  const page = await api
    .get("/api/members?status=PENDING_VERIFY&pageSize=1&q=" + email)
    .set("Authorization", auth());
  assert.equal(page.body.items.length, 1);
  assert.equal(page.body.total, 1);
  const byName = await api
    .get("/api/members?q=" + encodeURIComponent("nguyen hoi vien"))
    .set("Authorization", auth());
  assert.ok(
    byName.body.items.some((m: { id: string }) => m.id === created.body.id),
  );
  assert.equal(
    (
      await api
        .get("/api/members/" + created.body.id)
        .set("Authorization", auth())
    ).body.displayName,
    "Nguyễn Hội Viên",
  );
});
test("UC04-03: duplicate create including concurrent requests makes one profile", async () => {
  const body = { displayName: "Concurrent", email: uniqueEmail() };
  const results = await Promise.all(
    [1, 2].map(() =>
      api.post("/api/members").set("Authorization", auth()).send(body),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal(await db.user.count({ where: { email: body.email } }), 1);
  const existing = await api
    .post("/api/members")
    .set("Authorization", auth())
    .send(body);
  assert.equal(existing.body.code, "MEMBER_EXISTS");
  assert.ok(existing.body.memberId);
  const role = await api
    .post("/api/members")
    .set("Authorization", auth())
    .send({ displayName: "Wrong role", email });
  assert.equal(role.status, 409);
  assert.equal(role.body.code, "CONTACT_ROLE_CONFLICT");
});
test("UC04-04: attach an existing member only after explicit confirmation", async () => {
  const member = await db.user.create({
    data: { displayName: "Existing", email: uniqueEmail() },
  });
  users.push(member.id);
  const body = { displayName: "Existing", email: member.email, heightCm: 170 };
  const first = await api
    .post("/api/members")
    .set("Authorization", auth())
    .send(body);
  assert.equal(first.status, 409);
  assert.equal(first.body.existingUserId, member.id);
  const second = await api
    .post("/api/members")
    .set("Authorization", auth())
    .send({ ...body, existingUserId: member.id });
  assert.equal(second.status, 201);
  assert.equal(
    await db.memberProfile.count({ where: { userId: member.id } }),
    1,
  );
  const other = await db.user.create({
    data: { displayName: "Other", phone: "098" + String(Date.now()).slice(-7) },
  });
  users.push(other.id);
  const conflict = await api
    .post("/api/members")
    .set("Authorization", auth())
    .send({ ...body, phone: other.phone });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.code, "CONTACT_CONFLICT");
});
test("UC04-05: update, field validation, contact immutability and optimistic concurrency", async () => {
  const created = await api
    .post("/api/members")
    .set("Authorization", auth())
    .send({ displayName: "Before", email: uniqueEmail() });
  const id = created.body.id;
  for (const extra of [
    { heightCm: -1 },
    { weightKg: 0 },
    { heightCm: 0.001 },
    { dateOfBirth: "2099-01-01" },
    { dateOfBirth: "2026-02-30" },
    { email: uniqueEmail() },
  ]) {
    assert.equal(
      (
        await api
          .patch("/api/members/" + id)
          .set("Authorization", auth())
          .send({ displayName: "After", version: 0, ...extra })
      ).status,
      400,
    );
  }
  const updated = await api
    .patch("/api/members/" + id)
    .set("Authorization", auth())
    .send({ displayName: "After", heightCm: 175, version: 0 });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.version, 1);
  const stale = await api
    .patch("/api/members/" + id)
    .set("Authorization", auth())
    .send({ displayName: "Stale", version: 0 });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, "VERSION_CONFLICT");
  const simultaneous = await Promise.all(
    ["A", "B"].map((displayName) =>
      api
        .patch("/api/members/" + id)
        .set("Authorization", auth())
        .send({ displayName, version: 1 }),
    ),
  );
  assert.deepEqual(simultaneous.map((r) => r.status).sort(), [200, 409]);
});
test("UC04-06: deactivate revokes sessions, preserves package/payment, blocks writes and login", async () => {
  const memberEmail = uniqueEmail();
  const created = await api
    .post("/api/members")
    .set("Authorization", auth())
    .send({ displayName: "Deactivate", email: memberEmail });
  const profile = await db.memberProfile.findUniqueOrThrow({
    where: { id: created.body.id },
  });
  await db.user.update({
    where: { id: profile.userId },
    data: {
      status: "ACTIVE",
      verifiedAt: new Date(),
      passwordHash: await hashPassword(password),
    },
  });
  const pkg = await db.package.create({
    data: {
      code: randomUUID(),
      name: "UC04 history",
      price: 500000,
      durationMonths: 1,
    },
  });
  const membership = await db.membership.create({
    data: {
      code: randomUUID(),
      requestId: randomUUID(),
      memberId: profile.id,
      packageId: pkg.id,
      packageNameSnapshot: pkg.name,
      durationMonthsSnapshot: 1,
      priceSnapshot: pkg.price,
      grantsGymAccessSnapshot: true,
      startsOn: new Date("2026-11-01"),
      endsBefore: new Date("2026-12-01"),
    },
  });
  const payment = await db.payment.create({
    data: {
      code: randomUUID(),
      membershipId: membership.id,
      amount: 500000,
      idempotencyKey: randomUUID(),
    },
  });
  const history = await api
    .get("/api/members/" + profile.id)
    .set("Authorization", auth());
  assert.equal(history.body.purchaseHistory.length, 1);
  assert.equal(history.body.purchaseHistory[0].packageName, pkg.name);
  assert.equal(history.body.purchaseHistory[0].price, 500000);
  assert.equal(history.body.totalSpent, 0);
  assert.equal(history.body.purchaseHistory[0].payment.code, payment.code);
  assert.equal(history.body.purchaseHistory[0].payment.status, "PENDING");
  assert.equal(
    "idempotencyKey" in history.body.purchaseHistory[0].payment,
    false,
  );
  const session = await login(memberEmail, "MOBILE");
  assert.equal(session.status, 200);
  assert.equal(
    (
      await api
        .post("/api/members/" + profile.id + "/deactivate")
        .set("Authorization", auth())
        .send({ version: 0, reason: "" })
    ).status,
    400,
  );
  const res = await api
    .post("/api/members/" + profile.id + "/deactivate")
    .set("Authorization", auth())
    .send({ version: 0, reason: "Hội viên yêu cầu" });
  assert.equal(res.status, 201);
  assert.equal(res.body.accountStatus, "DEACTIVATED");
  assert.equal(
    (
      await api
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${session.body.accessToken}`)
    ).status,
    401,
  );
  assert.equal((await login(memberEmail, "MOBILE")).status, 403);
  assert.equal(
    (
      await api
        .patch("/api/members/" + profile.id)
        .set("Authorization", auth())
        .send({ displayName: "No", version: 1 })
    ).status,
    409,
  );
  const log = await db.auditLog.findFirstOrThrow({
    where: { entityId: profile.id, action: "MEMBER_DEACTIVATE" },
  });
  assert.equal(log.reason, "Hội viên yêu cầu");
  assert.equal(await db.membership.count({ where: { id: membership.id } }), 1);
  assert.equal(await db.payment.count({ where: { id: payment.id } }), 1);
  await db.payment.delete({ where: { id: payment.id } });
  await db.membership.delete({ where: { id: membership.id } });
  await db.package.delete({ where: { id: pkg.id } });
});
test("UC04-07: logout revokes server session", async () => {
  const session = await login(email);
  const header = `Bearer ${session.body.accessToken}`;
  assert.equal(
    (await api.post("/api/auth/logout").set("Authorization", header)).status,
    200,
  );
  assert.equal(
    (await api.get("/api/auth/me").set("Authorization", header)).status,
    401,
  );
});

test("UC04-08: overview counts all profiles and only confirmed payments contribute to spending", async () => {
  assert.equal((await api.get("/api/members/overview")).status, 401);
  assert.equal(
    (
      await api
        .get("/api/members/overview")
        .set("Authorization", `Bearer ${trainerToken}`)
    ).status,
    403,
  );
  const overview = await api
    .get("/api/members/overview")
    .set("Authorization", auth());
  assert.equal(overview.status, 200);
  assert.equal(overview.body.total, await db.memberProfile.count());
  assert.equal(
    overview.body.total,
    overview.body.active +
      overview.body.pendingVerification +
      overview.body.unavailable,
  );
  const created = await api
    .post("/api/members")
    .set("Authorization", auth())
    .send({ displayName: "Overview fixture", email: uniqueEmail() });
  assert.equal(created.body.totalSpent, 0);
  assert.ok(created.body.createdAt);
  const updated = await api
    .get("/api/members/overview")
    .set("Authorization", auth());
  assert.equal(updated.body.total, overview.body.total + 1);
  assert.equal(
    updated.body.pendingVerification,
    overview.body.pendingVerification + 1,
  );
});
