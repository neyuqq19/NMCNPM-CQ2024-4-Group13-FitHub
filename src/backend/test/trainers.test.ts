import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, before } from "node:test";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { PrismaClient, type Role } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { AllExceptionsFilter } from "../src/common/filters/http-exception.filter";
import { hashPassword } from "../src/modules/auth/password";
import { gymClock } from "../src/modules/check-ins/eligibility";
import { WorkingSlotsService } from "../src/modules/trainers/working-slots.service";

const url = new URL(process.env.DATABASE_URL || "postgresql://invalid/invalid");
if (
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  url.pathname !== "/fithub_test"
)
  throw Error("Requires isolated fithub_test.");
const db = new PrismaClient();
const run = randomUUID();
const users: string[] = [];
const password = "FitHubTest!2026";
let app: Awaited<ReturnType<typeof NestFactory.create>>;
let api: ReturnType<typeof request>;
let trainer: string, other: string, member: string, admin: string;
let id: string, otherId: string, actor: string;

before(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  api = request(app.getHttpServer());
  const passwordHash = await hashPassword(password);

  async function account(role: Role, label: string) {
    const user = await db.user.create({
      data: {
        role,
        displayName: run + label,
        status: "ACTIVE",
        verifiedAt: new Date(),
        passwordHash,
        email: run + label.toLowerCase() + "@example.com",
      },
    });
    users.push(user.id);
    const res = await api
      .post("/api/auth/login")
      .send({
        identifier: user.email,
        password,
        platform: role === "MEMBER" ? "MOBILE" : "WEB",
        deviceId: randomUUID(),
        requestId: randomUUID(),
      })
      .expect(200);
    return { token: "Bearer " + res.body.accessToken, userId: user.id };
  }
  const owner = await account("TRAINER", "Owner");
  trainer = owner.token;
  actor = owner.userId;
  id = (await db.trainerProfile.findUniqueOrThrow({ where: { userId: actor } }))
    .id;
  const second = await account("TRAINER", "Second");
  other = second.token;
  otherId = (
    await db.trainerProfile.findUniqueOrThrow({
      where: { userId: second.userId },
    })
  ).id;
  member = (await account("MEMBER", "Member")).token;
  admin = (await account("ADMIN", "Admin")).token;
});

after(async () => {
  await db.auditLog.deleteMany({ where: { actorId: { in: users } } });
  await db.authEvent.deleteMany({ where: { userId: { in: users } } });
  await db.workingSlot.deleteMany({
    where: { trainer: { userId: { in: users } } },
  });
  await db.memberProfile.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await app?.close();
  await db.$disconnect();
});

const base = "/api/trainers";
const profile = {
  bio: "  Huấn luyện cá nhân  ",
  specialties: ["  Strength  "],
  experienceYears: 0,
  version: 0,
};
const save = (auth: string, data: unknown, target = "me") =>
  api
    .put(base + "/" + target + "/profile")
    .set("Authorization", auth)
    .send(data as object);
const add = (auth: string, data: object) =>
  api
    .post(base + "/me/certifications")
    .set("Authorization", auth)
    .send(data);

test("UC06 only owners may edit, drafts stay private, invalid fields cannot change version", async () => {
  await api.get(base).expect(401);
  const mine = await api
    .get(base + "/me")
    .set("Authorization", trainer)
    .expect(200);
  assert.equal(mine.body.id, id);
  for (const unauthorized of [member, admin, other]) {
    const res = await save(unauthorized, profile, id);
    assert.equal(res.status, 403);
    assert.equal(res.body.code, "NOT_PROFILE_OWNER");
  }
  await api
    .get(base + "/" + otherId)
    .set("Authorization", member)
    .expect(404);
  for (const [key, invalid] of Object.entries({
    bio: [" ", "a".repeat(1001)],
    specialties: [[], [" "], Array(11).fill("s")],
    experienceYears: [-1, 51, 1.5, "3"],
    version: [null, -1, "0"],
    avatarUrl: ["javascript:void(0)"],
    workStatus: ["LOCKED", null],
  })) {
    for (const value of invalid) {
      const res = await save(trainer, { ...profile, [key]: value });
      assert.equal(res.status, 400);
      assert.equal(res.body.code, "INVALID_TRAINER_PROFILE");
      assert.ok(res.body.fieldErrors[key]);
    }
  }
  assert.equal(
    (await db.trainerProfile.findUniqueOrThrow({ where: { id } })).version,
    0,
  );
});

test("UC06 concurrent profile writes, directory filters, certificates and audit share a version", async () => {
  const race = await Promise.all([
    save(trainer, profile),
    save(trainer, profile),
  ]);
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    race.find((r) => r.status === 409)!.body.code,
    "VERSION_CONFLICT",
  );
  const saved = race.find((r) => r.status === 200)!.body;
  assert.equal(saved.version, 1);
  assert.equal(saved.bio, profile.bio.trim());
  assert.deepEqual(saved.specialties, ["Strength"]);
  const list = (auth: string, specialty = "") =>
    api.get(base).set("Authorization", auth).query({ q: run, specialty });
  for (const auth of [member, admin, trainer]) {
    const res = await list(auth, "streng").expect(200);
    assert.deepEqual(
      res.body.items.map((p: { id: string }) => p.id),
      [id],
    );
  }
  assert.deepEqual((await list(member, "Pilates")).body.items, []);
  for (const status of ["LOCKED", "DEACTIVATED"] as const) {
    await db.user.update({ where: { id: actor }, data: { status } });
    assert.deepEqual((await list(member)).body.items, []);
    await api
      .get(base + "/" + id)
      .set("Authorization", member)
      .expect(404);
  }
  await db.user.update({ where: { id: actor }, data: { status: "ACTIVE" } });
  const cert = {
    name: "NASM CPT",
    issuer: "NASM",
    issuedAt: gymClock(new Date()).day,
    version: 1,
    credentialUrl: "CPT-123",
  };
  const future = await add(trainer, {
    ...cert,
    issuedAt: gymClock(new Date(Date.now() + 86400000)).day,
  }).expect(400);
  assert.equal(future.body.code, "FUTURE_ISSUE_DATE");
  await add(trainer, { ...cert, issuedAt: "2025-02-30" }).expect(400);
  const added = await add(trainer, cert).expect(201);
  assert.equal(added.body.version, 2);
  const [stored] = added.body.certifications;
  assert.equal(stored.issuedAt, cert.issuedAt);
  assert.equal(stored.credentialUrl, cert.credentialUrl);
  const reread = await api
    .get(base + "/" + id)
    .set("Authorization", admin)
    .expect(200);
  assert.deepEqual(reread.body, added.body);
  assert.equal((await list(member)).body.items[0].certificationCount, 1);
  const remove = (auth: string, version: number) =>
    api
      .delete(base + "/me/certifications/" + stored.id)
      .set("Authorization", auth)
      .send({ version });
  await remove(other, 0).expect(403);
  assert.equal(
    (await db.trainerProfile.findUniqueOrThrow({ where: { id: otherId } }))
      .version,
    0,
  );
  await remove(trainer, 1).expect(409);
  const deleted = await remove(trainer, 2).expect(200);
  assert.equal(deleted.body.version, 3);
  assert.deepEqual(deleted.body.certifications, []);
  await remove(trainer, 3).expect(404);
  assert.equal(
    (await db.trainerProfile.findUniqueOrThrow({ where: { id } })).version,
    3,
  );
  const logs = await db.auditLog.findMany({
    where: { entityId: id, actorId: actor },
    orderBy: { createdAt: "asc" },
  });
  assert.deepEqual(
    logs.map((l) => l.action),
    [
      "UPDATE_TRAINER_PROFILE",
      "ADD_TRAINER_CERTIFICATION",
      "DELETE_TRAINER_CERTIFICATION",
    ],
  );
});

test("UC07 atomic registration, buffer, private weekly view, future availability and 24-hour cutoff", async () => {
  const service = app.get(WorkingSlotsService);
  const date = "2032-06-03";
  const now = new Date("2032-06-02T08:00:00+07:00");
  service.now = () => now;
  const range = { date, startTime: "08:00", endTime: "12:00" };
  const register = (body: object, token = trainer) =>
    api
      .post(base + "/me/availability")
      .set("Authorization", token)
      .send(body);
  const day = (target: string, token: string) =>
    api
      .get(base + "/" + target + "/slots")
      .query({ from: date, to: date })
      .set("Authorization", token);
  const available = () =>
    api
      .get(base + "/" + id + "/available-slots")
      .query({ date })
      .set("Authorization", member);
  const change = (
    slot: string,
    status: string,
    reason?: string,
    token = trainer,
  ) =>
    api
      .patch(base + "/me/slots/" + slot + "/availability")
      .set("Authorization", token)
      .send({ status, reason });
  const erase = (slot: string) =>
    api.delete(base + "/me/slots/" + slot).set("Authorization", trainer);
  await register(range, admin).expect(403);
  await register(range, member).expect(403);
  for (const values of [
    { date: "2032-06-01" },
    { date: "2032-02-30" },
    { startTime: "05:59" },
    { endTime: "22:01" },
    { startTime: "9:broken" },
    { startTime: null },
  ])
    await register({ ...range, ...values }).expect(400);
  assert.equal(
    (await register({ ...range, endTime: "08:45" }).expect(400)).body.code,
    "RANGE_TOO_SHORT",
  );
  const race = await Promise.all([register(range), register(range)]);
  assert.deepEqual(race.map((r) => r.status).sort(), [201, 409]);
  assert.equal(race.find((r) => r.status === 409)!.body.code, "SLOT_OVERLAP");
  const created = race.find((r) => r.status === 201)!.body;
  assert.equal(created.discardedMinutes, 30);
  const [a, b, c] = created.slots;
  assert.equal(a.startTime, "2032-06-03T01:00:00.000Z");
  assert.equal(c.endTime, "2032-06-03T04:30:00.000Z");
  assert.equal(
    (
      await register({ ...range, startTime: "11:44", endTime: "12:44" }).expect(
        409,
      )
    ).body.code,
    "SLOT_OVERLAP",
  );
  // A caller bypassing the API still cannot insert into another slot's rest period.
  await assert.rejects(
    db.$executeRaw`INSERT INTO "WorkingSlot" (id, "trainerId", "workDate", "startTime", "endTime")
      VALUES (gen_random_uuid(), ${id}::uuid, ${date}::date,
        ${date + "T11:44:00+07:00"}::timestamptz, ${date + "T12:44:00+07:00"}::timestamptz)`,
    (error: unknown) =>
      (error as { meta?: { code?: string } }).meta?.code === "23P01",
  );
  const extended = await register({
    ...range,
    startTime: "11:45",
    endTime: "12:45",
  }).expect(201);
  assert.equal(extended.body.slots.length, 1);
  await change(a.id, "UNAVAILABLE", "Bận họp", other).expect(403);
  await change(a.id, "UNAVAILABLE", "Bận họp", admin).expect(403);
  await change(a.id, "BOOKED").expect(400);
  await change(randomUUID(), "OPEN").expect(404);
  const busy = await change(a.id, "UNAVAILABLE", "  Bận họp  ").expect(200);
  assert.equal(busy.body.unavailableReason, "Bận họp");
  const reopened = await change(a.id, "OPEN").expect(200);
  assert.equal(reopened.body.unavailableReason, null);
  now.setTime(now.getTime() + 1);
  assert.equal(
    (await change(a.id, "UNAVAILABLE", "Họp").expect(400)).body.code,
    "NOTICE_TOO_LATE",
  );
  assert.equal((await erase(a.id).expect(400)).body.code, "NOTICE_TOO_LATE");
  await change(c.id, "UNAVAILABLE", "Họp").expect(200);
  const memberUser = await db.user.findUniqueOrThrow({
    where: { email: run + "member@example.com" },
  });
  const bookedMember = await db.memberProfile.create({
    data: { userId: memberUser.id, memberCode: "TEST-" + run },
  });
  await db.workingSlot.update({
    where: { id: b.id },
    data: { status: "BOOKED", memberId: bookedMember.id },
  });
  assert.equal(
    (await change(b.id, "UNAVAILABLE", "Họp").expect(409)).body.code,
    "SLOT_ALREADY_BOOKED",
  );
  assert.equal(
    (await erase(b.id).expect(409)).body.code,
    "SLOT_ALREADY_BOOKED",
  );
  await day(id, other).expect(403);
  await day(id, member).expect(403);
  for (const [target, token] of [
    ["me", trainer],
    [id, admin],
  ]) {
    const view = await day(target, token).expect(200);
    assert.deepEqual(
      view.body.map((s: { status: string }) => s.status),
      ["OPEN", "BOOKED", "UNAVAILABLE", "OPEN"],
    );
    assert.deepEqual(view.body[1].member, {
      memberCode: bookedMember.memberCode,
      displayName: memberUser.displayName,
    });
  }
  await erase(extended.body.slots[0].id).expect(204);
  await erase(extended.body.slots[0].id).expect(404);
  // Legacy or externally written rows must never reveal a private reason on UC08.
  await db.workingSlot.update({
    where: { id: a.id },
    data: { unavailableReason: "Lý do riêng tư" },
  });
  const open = await available().expect(200);
  assert.deepEqual(
    open.body.map((s: { id: string }) => s.id),
    [a.id],
  );
  assert.equal(open.body[0].member, null);
  assert.equal(open.body[0].unavailableReason, null);
  const beforeLeave = (
    await api
      .get(base + "/me")
      .set("Authorization", trainer)
      .expect(200)
  ).body;
  const leave = await save(trainer, {
    ...profile,
    version: beforeLeave.version,
    workStatus: "ON_LEAVE",
  }).expect(200);
  assert.equal(leave.body.accountStatus, "ACTIVE");
  assert.equal(leave.body.workStatus, "ON_LEAVE");
  assert.deepEqual((await available().expect(200)).body, []);
  const preserved = await save(trainer, {
    ...profile,
    version: leave.body.version,
  }).expect(200);
  assert.equal(preserved.body.workStatus, "ON_LEAVE");
  await day("me", trainer).expect(200);
  const relogin = await api
    .post("/api/auth/login")
    .send({
      identifier: run + "owner@example.com",
      password,
      platform: "WEB",
      deviceId: randomUUID(),
      requestId: randomUUID(),
    })
    .expect(200);
  trainer = "Bearer " + relogin.body.accessToken;
  await save(trainer, {
    ...profile,
    version: preserved.body.version,
    workStatus: "ACTIVE",
  }).expect(200);
  assert.deepEqual(
    (await available().expect(200)).body.map((s: { id: string }) => s.id),
    [a.id],
  );
  await db.user.update({ where: { id: actor }, data: { status: "LOCKED" } });
  assert.deepEqual((await available().expect(200)).body, []);
  await db.user.update({ where: { id: actor }, data: { status: "ACTIVE" } });
  now.setTime(Date.parse(a.startTime));
  assert.deepEqual((await available().expect(200)).body, []);
  const logs = await db.auditLog.findMany({
    where: { actorId: actor, entityType: "WorkingSlot" },
  });
  assert.equal(
    logs.filter((l) => l.action === "REGISTER_WORKING_SLOT").length,
    4,
  );
  assert.equal(
    logs.filter((l) => l.action === "SET_SLOT_AVAILABILITY").length,
    3,
  );
  assert.equal(
    logs.filter((l) => l.action === "DELETE_WORKING_SLOT").length,
    1,
  );
});
