// UC13 — Nhật ký tập luyện: API + PostgreSQL (isolated fithub_test only).
import "reflect-metadata";
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { PrismaClient, type Role } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { hashPassword } from "../src/modules/auth/password";
import { WorkoutsService } from "../src/modules/workouts/workouts.service";
import { AllExceptionsFilter } from "../src/common/filters/http-exception.filter";

const url = new URL(process.env.DATABASE_URL || "postgresql://invalid/invalid");
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/fithub_test")
  throw Error("UC13 tests require isolated fithub_test.");
const db = new PrismaClient();
let app: Awaited<ReturnType<typeof NestFactory.create>>;
let api: ReturnType<typeof request>;
const today = "2026-11-12";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
let passwordHash: string;

async function account(role: Role = "MEMBER") {
  const user = await db.user.create({
    data: {
      email: `uc13-${randomUUID()}@example.com`,
      displayName: "Hội viên UC13",
      passwordHash,
      role,
      status: "ACTIVE",
      verifiedAt: new Date(),
    },
  });
  if (role === "MEMBER")
    await db.memberProfile.create({ data: { userId: user.id, memberCode: `UC13-${randomUUID()}` } });
  const token = randomUUID() + randomUUID();
  await db.session.create({
    data: {
      userId: user.id,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      requestId: randomUUID(),
      deviceId: randomUUID(),
      platform: role === "MEMBER" ? "MOBILE" : "WEB",
      expiresAt: new Date(Date.now() + 86400_000),
    },
  });
  return token;
}
const squat = (sets: [string, number, number][], performedOn = today, title = "Leg Day") => ({
  title,
  performedOn,
  durationMinutes: 45,
  exercises: [
    {
      exerciseName: "Back Squat",
      sets: sets.map(([setType, weightKg, reps]) => ({ setType, weightKg, reps })),
    },
  ],
});
const records = async (token: string) =>
  (await api.get("/api/workouts/my/records").set(auth(token))).body as any[];

before(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  api = request(app.getHttpServer());
  app.get(WorkoutsService).now = () => new Date(`${today}T05:00:00Z`);
  passwordHash = await hashPassword("UC13Test!2026");
});
after(async () => {
  await app?.close();
  await db.$disconnect();
});

test("UC13-01: volume, Epley baseline, then a strictly higher 1RM is a PR (spec acceptance)", async () => {
  const token = await account();
  const first = await api.post("/api/workouts").set(auth(token)).send(squat([["W", 60, 10], ["R", 100, 5]], "2026-11-10"));
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.equal(first.body.totalVolume, 1100);
  const [w, r] = first.body.exercises[0].sets;
  assert.deepEqual([w.setType, w.estimated1RM, w.isPR], ["W", null, false]);
  assert.deepEqual([r.setType, r.estimated1RM, r.isPR], ["R", 116.67, false]);
  assert.deepEqual(first.body.newRecords, []);
  let pr = await records(token);
  assert.equal(pr.length, 1);
  assert.deepEqual([pr[0].oneRepMax, pr[0].isBaseline, pr[0].isPR], [116.67, true, false]);

  // Matching the record is not a PR.
  const same = await api.post("/api/workouts").set(auth(token)).send(squat([["R", 100, 5]], "2026-11-11"));
  assert.deepEqual(same.body.newRecords, []);

  const second = await api.post("/api/workouts").set(auth(token)).send(squat([["R", 105, 5]]));
  assert.equal(second.status, 201);
  assert.equal(second.body.exercises[0].sets[0].isPR, true);
  assert.deepEqual(second.body.newRecords, [{ exerciseName: "Back Squat", oneRepMax: 122.5 }]);
  pr = await records(token);
  assert.deepEqual([pr[0].oneRepMax, pr[0].isBaseline, pr[0].isPR, pr[0].sessionId], [122.5, false, true, second.body.id]);

  // History persists in PostgreSQL with month stats.
  const list = await api.get("/api/workouts/my").set(auth(token));
  assert.equal(list.status, 200);
  assert.equal(list.body.total, 3);
  assert.equal(list.body.items[0].id, second.body.id);
  assert.deepEqual(list.body.stats, {
    month: "2026-11",
    sessionsThisMonth: 3,
    totalMinutesThisMonth: 135,
    totalVolumeThisMonth: 1100 + 500 + 525,
    currentStreakDays: 3,
  });
  const filtered = await api.get("/api/workouts/my?from=2026-11-11&exercise=squat&pageSize=1").set(auth(token));
  assert.equal(filtered.body.total, 2);
  assert.equal(filtered.body.items.length, 1);
});

test("UC13-02: W/D/F and bodyweight sets never create a record; empty session is rejected", async () => {
  const token = await account();
  const res = await api.post("/api/workouts").set(auth(token)).send({
    title: "Core",
    performedOn: today,
    exercises: [
      { exerciseName: "Plank Row", sets: [{ setType: "W", reps: 10, weightKg: 20 }, { setType: "D", reps: 8, weightKg: 15 }, { setType: "F", reps: 6, weightKg: 25 }] },
      { exerciseName: "Push-up", sets: [{ setType: "R", reps: 20, weightKg: 0 }] },
    ],
  });
  assert.equal(res.status, 201);
  assert.ok(res.body.exercises.flatMap((e: any) => e.sets).every((s: any) => s.estimated1RM === null && !s.isPR));
  assert.deepEqual(await records(token), []);
  const empty = await api.post("/api/workouts").set(auth(token)).send({ title: "x", performedOn: today, exercises: [] });
  assert.equal(empty.status, 400);
  assert.equal(empty.body.code, "EMPTY_WORKOUT_SESSION");
  const bad = await api.post("/api/workouts").set(auth(token)).send(squat([["R", 100, 0]]));
  assert.equal(bad.status, 400);
  assert.equal(bad.body.code, "VALIDATION_ERROR");
});

test("UC13-03: edit and delete recalculate volume and records (A1, A2)", async () => {
  const token = await account();
  const base = (await api.post("/api/workouts").set(auth(token)).send(squat([["R", 100, 5]], "2026-11-01"))).body;
  const better = (await api.post("/api/workouts").set(auth(token)).send(squat([["R", 105, 5]], "2026-11-02"))).body;
  assert.equal(better.exercises[0].sets[0].isPR, true);

  // Lowering the newer session removes its PR; the baseline holds again.
  const edited = await api.put(`/api/workouts/${better.id}`).set(auth(token)).send(squat([["R", 90, 5], ["W", 50, 10]], "2026-11-02", "Edited"));
  assert.equal(edited.status, 200);
  assert.equal(edited.body.title, "Edited");
  assert.equal(edited.body.totalVolume, 950);
  assert.equal(edited.body.exercises[0].sets[0].isPR, false);
  let pr = await records(token);
  assert.deepEqual([pr[0].oneRepMax, pr[0].isBaseline, pr[0].sessionId], [116.67, true, base.id]);

  // Renaming the exercise moves it to a different record.
  await api.put(`/api/workouts/${better.id}`).set(auth(token)).send({ ...squat([["R", 90, 5]], "2026-11-02"), exercises: [{ exerciseName: "Front Squat", sets: [{ setType: "R", reps: 5, weightKg: 90 }] }] });
  pr = await records(token);
  assert.deepEqual(pr.map((r) => r.exerciseName).sort(), ["Back Squat", "Front Squat"]);

  // Deleting the only Back Squat session removes that record.
  const del = await api.delete(`/api/workouts/${base.id}`).set(auth(token));
  assert.equal(del.status, 200);
  pr = await records(token);
  assert.deepEqual(pr.map((r) => r.exerciseName), ["Front Squat"]);
  assert.equal((await api.get(`/api/workouts/${base.id}`).set(auth(token))).status, 404);
});

test("UC13-SR01: members only see and change their own sessions", async () => {
  const owner = await account();
  const other = await account();
  const admin = await account("ADMIN");
  const s = (await api.post("/api/workouts").set(auth(owner)).send(squat([["R", 100, 5]]))).body;
  for (const res of [
    await api.get(`/api/workouts/${s.id}`).set(auth(other)),
    await api.put(`/api/workouts/${s.id}`).set(auth(other)).send(squat([["R", 10, 5]])),
    await api.delete(`/api/workouts/${s.id}`).set(auth(other)),
  ]) {
    assert.equal(res.status, 403);
    assert.equal(res.body.code, "FORBIDDEN");
  }
  assert.equal((await api.get("/api/workouts/my").set(auth(other))).body.total, 0);
  assert.equal((await api.get("/api/workouts/my").set(auth(admin))).status, 403);
  assert.equal((await api.get("/api/workouts/my")).status, 401);
  assert.equal((await api.get(`/api/workouts/${s.id}`).set(auth(owner))).status, 200);
});
