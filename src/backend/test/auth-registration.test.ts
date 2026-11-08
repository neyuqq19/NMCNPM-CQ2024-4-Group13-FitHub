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
import { OtpMailer } from "../src/modules/auth/otp-mailer";
import { RegistrationService } from "../src/modules/auth/registration.service";
import { verifyPassword } from "../src/modules/auth/password";
const target = new URL(
  process.env.DATABASE_URL || "postgresql://invalid/invalid",
);
if (
  !["localhost", "127.0.0.1"].includes(target.hostname) ||
  target.pathname !== "/fithub_test"
)
  throw Error("Requires isolated fithub_test");
process.env.OTP_HASH_SECRET = randomUUID() + randomUUID();
const db = new PrismaClient();
let app: Awaited<ReturnType<typeof NestFactory.create>>,
  api: ReturnType<typeof request>,
  service: RegistrationService;
const prefix = "otp-" + randomUUID();
const password = "MobileTest!2026";
let serial = 0;
const email = () => `${prefix}-${++serial}@example.com`;
const sent = new Map<string, string>();
let failDelivery = false;
const body = (value: string) => ({
  email: value,
  password,
  confirmPassword: password,
});
const login = (
  value: string,
  deviceId = randomUUID(),
  requestId = randomUUID(),
) =>
  api.post("/api/auth/login").send({
    identifier: value,
    password,
    platform: "MOBILE",
    deviceId,
    requestId,
  });
async function age(id: string) {
  await db.emailVerification.update({
    where: { id },
    data: { lastSentAt: new Date(Date.now() - 61000) },
  });
}
before(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  api = request(app.getHttpServer());
  service = app.get(RegistrationService);
  const mailer = app.get(OtpMailer);
  mailer.assertConfigured = () => {};
  mailer.send = async (recipient, code) => {
    sent.set(recipient, code);
    if (failDelivery) throw Error("Provider unavailable");
  };
});
after(async () => {
  const users = await db.user.findMany({
    where: { email: { startsWith: prefix } },
    select: { id: true },
  });
  await db.memberProfile.deleteMany({
    where: { userId: { in: users.map((u) => u.id) } },
  });
  await db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await app.close();
  await db.$disconnect();
});
test("UC01-01: validates fields, returns masked challenge, stores only hashed OTP", async () => {
  assert.equal(
    (
      await api
        .post("/api/auth/register")
        .send({ ...body("invalid"), password: "123" })
    ).status,
    400,
  );
  assert.equal(
    (
      await api
        .post("/api/auth/register")
        .send({ ...body(email()), confirmPassword: "mismatch" })
    ).status,
    400,
  );
  const e = email();
  const res = await api.post("/api/auth/register").send(body(e));
  assert.equal(res.status, 201);
  assert.equal(res.body.deliveryStatus, "SENT");
  assert.equal("code" in res.body, false);
  assert.ok(res.body.emailMasked.includes("***"));
  const stored = await db.emailVerification.findUniqueOrThrow({
    where: { id: res.body.verificationId },
    include: { user: true },
  });
  assert.notEqual(stored.codeHash, sent.get(e));
  assert.equal(stored.user.status, "PENDING_VERIFY");
  assert.equal(await verifyPassword(password, stored.user.passwordHash!), true);
  assert.equal((await login(e)).status, 403);
});
test("UC01-02: verifies exactly once, creates one profile, allows login without package", async () => {
  const e = email(),
    v = await service.register(body(e));
  const input = {
    verificationId: v.verificationId,
    code: sent.get(e)!,
    password,
    confirmPassword: password,
  };
  const results = await Promise.all([
    service.verify(input),
    service.verify(input),
  ]);
  assert.ok(results.every((r) => r.verified));
  const user = await db.user.findUniqueOrThrow({ where: { email: e } });
  assert.equal(user.status, "ACTIVE");
  assert.ok(user.verifiedAt);
  assert.equal(await db.memberProfile.count({ where: { userId: user.id } }), 1);
  const res = await login(e);
  assert.equal(res.status, 200);
  assert.equal(res.body.membership.state, "NONE");
  assert.equal(
    (
      await api
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${res.body.accessToken}`)
    ).status,
    200,
  );
  assert.equal(
    (
      await api
        .get("/api/auth/membership")
        .set("Authorization", `Bearer ${res.body.accessToken}`)
    ).body.state,
    "NONE",
  );
  await assert.rejects(
    service.verify({
      ...input,
      code: input.code === "000000" ? "000001" : "000000",
    }),
  );
  await assert.rejects(service.register(body(e)));
});
test("UC01-03: concurrent/repeated registration preserves account/password and respects resend cooldown", async () => {
  const e = email();
  const [a, b] = await Promise.all([
    service.register(body(e)),
    service.register({
      ...body(e),
      password: "Different!2026",
      confirmPassword: "Different!2026",
    }),
  ]);
  assert.equal(a.verificationId, b.verificationId);
  assert.equal(await db.user.count({ where: { email: e } }), 1);
  const user = await db.user.findUniqueOrThrow({ where: { email: e } });
  // Either concurrent request may commit first; later requests must preserve that hash.
  assert.ok(
    (await verifyPassword(password, user.passwordHash!)) ||
      (await verifyPassword("Different!2026", user.passwordHash!)),
  );
  await service.register({
    ...body(e),
    password: "ThirdPassword9",
    confirmPassword: "ThirdPassword9",
  });
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { email: e } })).passwordHash,
    user.passwordHash,
  );
  await assert.rejects(
    service.resend(a.verificationId),
    (err: any) => err.getStatus() === 429,
  );
});
test("UC01-04: wrong OTP attempts persist, resend does not reset attempts, fifth attempt locks 15min", async () => {
  const e = email(),
    v = await service.register(body(e));
  let correct = sent.get(e)!;
  const wrong = correct === "000000" ? "000001" : "000000";
  for (let n = 0; n < 2; n++)
    await assert.rejects(
      service.verify({ verificationId: v.verificationId, code: wrong }),
    );
  await age(v.verificationId);
  await service.resend(v.verificationId);
  correct = sent.get(e)!;
  assert.equal(
    (
      await db.emailVerification.findUniqueOrThrow({
        where: { id: v.verificationId },
      })
    ).failedAttempts,
    2,
  );
  const different = correct === "000000" ? "000001" : "000000";
  for (let n = 0; n < 3; n++)
    await assert.rejects(
      service.verify({ verificationId: v.verificationId, code: different }),
    );
  let stored = await db.emailVerification.findUniqueOrThrow({
    where: { id: v.verificationId },
  });
  assert.equal(stored.failedAttempts, 5);
  assert.ok(stored.lockedUntil!.getTime() > Date.now() + 14 * 60000);
  await assert.rejects(
    service.verify({ verificationId: v.verificationId, code: correct }),
  );
  await assert.rejects(service.resend(v.verificationId));
  await db.emailVerification.update({
    where: { id: v.verificationId },
    data: {
      lockedUntil: new Date(Date.now() - 1),
      lastSentAt: new Date(Date.now() - 61000),
    },
  });
  await service.resend(v.verificationId);
  stored = await db.emailVerification.findUniqueOrThrow({
    where: { id: v.verificationId },
  });
  assert.equal(stored.failedAttempts, 0);
});
test("UC01-05: expiry, replaced OTP and delivery failures never activate the account", async () => {
  const e = email(),
    v = await service.register(body(e));
  const old = sent.get(e)!;
  await db.emailVerification.update({
    where: { id: v.verificationId },
    data: { expiresAt: new Date(Date.now() - 1) },
  });
  await assert.rejects(
    service.verify({ verificationId: v.verificationId, code: old }),
  );
  await age(v.verificationId);
  await service.resend(v.verificationId);
  if (sent.get(e) !== old)
    await assert.rejects(
      service.verify({ verificationId: v.verificationId, code: old }),
    );
  failDelivery = true;
  const other = email();
  await assert.rejects(service.register(body(other)));
  failDelivery = false;
  const user = await db.user.findUniqueOrThrow({
    where: { email: other },
    include: { emailVerification: true },
  });
  assert.equal(user.status, "PENDING_VERIFY");
  assert.equal(user.emailVerification?.deliveryStatus, "FAILED");
});
test("UC01-06: counter-created member keeps existing profile and sets password only after OTP", async () => {
  const e = email();
  const user = await db.user.create({
    data: {
      email: e,
      displayName: "Counter member",
      memberProfile: { create: { memberCode: "COUNTER-" + randomUUID() } },
    },
    include: { memberProfile: true },
  });
  const v = await service.register(body(e));
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash,
    null,
  );
  await service.verify({
    verificationId: v.verificationId,
    code: sent.get(e)!,
    password,
    confirmPassword: password,
  });
  const saved = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    include: { memberProfile: true },
  });
  assert.equal(saved.displayName, "Counter member");
  assert.equal(saved.memberProfile!.id, user.memberProfile!.id);
  assert.equal(await verifyPassword(password, saved.passwordHash!), true);
});
test("UC02: retry returns a usable session and concurrent devices leave one active session", async () => {
  const e = email(),
    v = await service.register(body(e));
  await service.verify({
    verificationId: v.verificationId,
    code: sent.get(e)!,
  });
  const device = randomUUID(),
    req = randomUUID();
  const first = await login(e, device, req),
    retry = await login(e, device, req);
  assert.equal(first.status, 200);
  assert.equal(retry.body.accessToken, first.body.accessToken);
  assert.equal(
    (
      await api
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${retry.body.accessToken}`)
    ).status,
    200,
  );
  const attempts = await Promise.all([login(e), login(e)]);
  assert.ok(attempts.every((r) => r.status === 200));
  const user = await db.user.findUniqueOrThrow({ where: { email: e } });
  assert.equal(
    await db.session.count({ where: { userId: user.id, revokedAt: null } }),
    1,
  );
  const valid = await Promise.all(
    attempts.map((r) =>
      api
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${r.body.accessToken}`),
    ),
  );
  assert.deepEqual(valid.map((r) => r.status).sort(), [200, 401]);
});

test("UC02: five simultaneous wrong passwords lock account and valid password cannot bypass lock", async () => {
  const e = email(),
    v = await service.register(body(e));
  await service.verify({
    verificationId: v.verificationId,
    code: sent.get(e)!,
  });
  const attempts = await Promise.all(
    Array.from({ length: 5 }, () =>
      api.post("/api/auth/login").send({
        identifier: e,
        password: "WrongPassword9",
        platform: "MOBILE",
        deviceId: randomUUID(),
        requestId: randomUUID(),
      }),
    ),
  );
  assert.ok(attempts.every((r) => r.status === 401 || r.status === 403));
  const user = await db.user.findUniqueOrThrow({ where: { email: e } });
  assert.ok(user.loginLockedUntil && user.loginLockedUntil > new Date());
  assert.equal((await login(e)).status, 403);
});
