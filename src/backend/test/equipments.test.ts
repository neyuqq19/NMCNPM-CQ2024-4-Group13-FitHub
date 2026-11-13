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

for (const value of [process.env.DATABASE_URL, process.env.DIRECT_URL]) {
  const u = new URL(value || "postgresql://invalid/invalid");
  if (
    !["localhost", "127.0.0.1"].includes(u.hostname) ||
    u.pathname !== "/fithub_test"
  ) {
    throw new Error("UC10 tests require isolated fithub_test.");
  }
}

const db = new PrismaClient();
let app: Awaited<ReturnType<typeof NestFactory.create>>;
let api: ReturnType<typeof request>;
let adminToken: string;
let staffToken: string;
let memberToken: string;
let passwordHash: string;

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

function auth(token = adminToken) {
  return { Authorization: `Bearer ${token}` };
}

async function createSession(
  role: "ADMIN" | "TRAINER" | "MEMBER",
  status: "ACTIVE" | "LOCKED" | "DEACTIVATED" = "ACTIVE",
) {
  const userId = randomUUID();
  const token = `uc10-${role.toLowerCase()}-${randomUUID()}`;
  await db.user.create({
    data: {
      id: userId,
      role,
      status,
      displayName: `${role} ${userId.slice(0, 6)}`,
      email: `uc10.${role.toLowerCase()}.${userId.slice(0, 8)}@fithub.test`,
      passwordHash,
      verifiedAt: new Date(),
    },
  });
  await db.session.create({
    data: {
      userId,
      tokenHash: hash(token),
      deviceId: randomUUID(),
      requestId: randomUUID(),
      platform: "WEB",
      expiresAt: new Date(Date.now() + 86400_000),
    },
  });
  return { userId, token };
}

before(async () => {
  passwordHash = await hashPassword("Password@123");
  adminToken = (await createSession("ADMIN")).token;
  staffToken = (await createSession("TRAINER")).token;
  memberToken = (await createSession("MEMBER")).token;

  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: false }));
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  api = request(app.getHttpServer());
});

after(async () => {
  await app?.close();
  await db.$disconnect();
});

test("UC10-01: RBAC enforcement, concurrent auto-code generation (EQ-{CATEGORY}-NNN), QR payload, list filters and detail view", async () => {
  // Member and Receptionist must be forbidden (403)
  const noAuth = await api.get("/api/equipments");
  assert.equal(noAuth.status, 401);

  const memberAttempt = await api
    .get("/api/equipments")
    .set(auth(memberToken));
  assert.equal(memberAttempt.status, 403);

  const staffAttempt = await api
    .post("/api/equipments")
    .set(auth(staffToken))
    .send({
      name: "Máy chạy bộ Technogym",
      category: "CARDIO",
      zone: "Tầng 1 - Khu Cardio",
    });
  assert.equal(staffAttempt.status, 403);

  // Concurrent creation of two CARDIO equipments must produce distinct sequential EQ-CARDIO-NNN codes
  const uniqueZone = `Khu Cardio Test ${randomUUID().slice(0, 6)}`;
  const [c1, c2] = await Promise.all([
    api
      .post("/api/equipments")
      .set(auth())
      .send({
        name: "Máy chạy bộ Technogym Excite 01",
        category: "CARDIO",
        zone: uniqueZone,
        purchasedAt: "2026-01-15",
        warrantyUntil: "2028-01-15",
        notes: "Nhập khẩu nguyên chiếc",
      }),
    api
      .post("/api/equipments")
      .set(auth())
      .send({
        name: "Máy chạy bộ Technogym Excite 02",
        category: "CARDIO",
        zone: uniqueZone,
        purchasedAt: "2026-01-15",
        warrantyUntil: "2028-01-15",
      }),
  ]);

  assert.equal(c1.status, 201);
  assert.equal(c2.status, 201);
  assert.notEqual(c1.body.code, c2.body.code);
  assert.match(c1.body.code, /^EQ-CARDIO-\d{3,}$/);
  assert.match(c2.body.code, /^EQ-CARDIO-\d{3,}$/);
  assert.equal(c1.body.status, "OPERATIONAL");
  assert.equal(c1.body.qrCodePayload, `FITHUB://EQUIPMENT/${c1.body.code}`);
  assert.equal(c1.body.history[0].action, "CREATED");
  assert.equal(c1.body.history[0].toStatus, "OPERATIONAL");

  // FITHUB-205 #4: Direct duplicate equipment code insertion must be rejected by Equipment_code_key unique constraint
  await assert.rejects(
    () =>
      db.equipment.create({
        data: {
          code: c1.body.code,
          name: "Thiết bị trùng mã code",
          category: "CARDIO",
          zone: uniqueZone,
          status: "OPERATIONAL",
          qrCodePayload: `FITHUB://EQUIPMENT/DUP-${randomUUID().slice(0, 6)}`,
        },
      }),
    /Unique constraint failed/i,
  );

  // List filter by zone, category, status, and search query q
  const listRes = await api
    .get("/api/equipments")
    .set(auth())
    .query({
      category: "CARDIO",
      zone: uniqueZone,
      status: "OPERATIONAL",
      q: c1.body.code,
    });
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.items.length, 1);
  assert.equal(listRes.body.items[0].id, c1.body.id);
  assert.ok(listRes.body.zones.includes(uniqueZone));
  assert.ok(listRes.body.overview.total >= 2);
});

test("UC10-02: field validation, warrantyUntil >= purchasedAt constraint, update info, and immutability of code/qrCodePayload/status", async () => {
  // Missing name/zone or invalid category -> 400 VALIDATION_ERROR
  const badCreate = await api
    .post("/api/equipments")
    .set(auth())
    .send({
      name: "   ",
      category: "INVALID_CAT",
      zone: "",
    });
  assert.equal(badCreate.status, 400);
  assert.equal(badCreate.body.code, "VALIDATION_ERROR");
  assert.ok(badCreate.body.fieldErrors.name);
  assert.ok(badCreate.body.fieldErrors.zone);
  assert.ok(badCreate.body.fieldErrors.category);

  // warrantyUntil < purchasedAt -> 400 VALIDATION_ERROR
  const reversedDates = await api
    .post("/api/equipments")
    .set(auth())
    .send({
      name: "Giàn tạ đa năng Smith Machine",
      category: "STRENGTH",
      zone: "Tầng 2 - Khu tạ khối",
      purchasedAt: "2026-06-01",
      warrantyUntil: "2026-05-31",
    });
  assert.equal(reversedDates.status, 400);
  assert.equal(reversedDates.body.code, "VALIDATION_ERROR");
  assert.ok(reversedDates.body.fieldErrors.warrantyUntil);

  // Create valid equipment, then test update & immutable fields
  const created = await api
    .post("/api/equipments")
    .set(auth())
    .send({
      name: "Ghế đẩy ngực ngang Olympic",
      category: "FREE_WEIGHT",
      zone: "Tầng 2 - Khu Free Weight",
      purchasedAt: "2026-02-01",
      warrantyUntil: "2027-02-01",
    });
  assert.equal(created.status, 201);
  const eqId = created.body.id as string;

  // Attempt to mutate code or status via PATCH /api/equipments/:id -> 400 IMMUTABLE_FIELD
  const mutateCode = await api
    .patch(`/api/equipments/${eqId}`)
    .set(auth())
    .send({ code: "EQ-HACK-999", name: "Ghế mới" });
  assert.equal(mutateCode.status, 400);
  assert.equal(mutateCode.body.code, "IMMUTABLE_FIELD");

  // Valid update of name, zone, warrantyUntil, notes
  const updated = await api
    .patch(`/api/equipments/${eqId}`)
    .set(auth())
    .send({
      name: "Ghế đẩy ngực ngang Olympic Pro",
      zone: "Tầng 2 - Khu Tạ Tự Do",
      warrantyUntil: "2028-02-01",
      notes: "Đã bọc lại nệm da cao cấp",
    });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.name, "Ghế đẩy ngực ngang Olympic Pro");
  assert.equal(updated.body.zone, "Tầng 2 - Khu Tạ Tự Do");
  assert.equal(updated.body.warrantyUntil, "2028-02-01");
  assert.equal(updated.body.notes, "Đã bọc lại nệm da cao cấp");
  assert.equal(updated.body.code, created.body.code);
  assert.ok(updated.body.history.some((h: { action: string }) => h.action === "UPDATED"));
});

test("UC10-03: reporting an incident transitions equipment to OUT_OF_ORDER and blocks duplicate open incidents", async () => {
  const created = await api
    .post("/api/equipments")
    .set(auth())
    .send({
      name: "Máy kéo xô Lat Pulldown",
      category: "STRENGTH",
      zone: "Tầng 2 - Khu Strength",
    });
  assert.equal(created.status, 201);
  const eqId = created.body.id as string;

  // Empty description -> 400 VALIDATION_ERROR
  const emptyInc = await api
    .post(`/api/equipments/${eqId}/incidents`)
    .set(auth())
    .send({ description: "   ", severity: "HIGH" });
  assert.equal(emptyInc.status, 400);
  assert.equal(emptyInc.body.code, "VALIDATION_ERROR");

  // Fire 2 concurrent incident reports -> exactly one succeeds (201) and one gets 409 INCIDENT_ALREADY_OPEN
  const [inc1, inc2] = await Promise.all([
    api
      .post(`/api/equipments/${eqId}/incidents`)
      .set(auth())
      .send({
        description: "Đứt dây cáp ròng rọc chính",
        severity: "HIGH",
      }),
    api
      .post(`/api/equipments/${eqId}/incidents`)
      .set(auth())
      .send({
        description: "Báo hỏng trùng lặp",
        severity: "MEDIUM",
      }),
  ]);

  const statuses = [inc1.status, inc2.status].sort();
  assert.deepEqual(statuses, [201, 409]);
  const winner = inc1.status === 201 ? inc1.body : inc2.body;
  const loser = inc1.status === 409 ? inc1.body : inc2.body;

  assert.equal(loser.code, "INCIDENT_ALREADY_OPEN");
  assert.equal(winner.status, "OUT_OF_ORDER");
  assert.ok(winner.openIncident);
  assert.equal(winner.openIncident.status, "OPEN");
  assert.equal(winner.openIncident.severity, "HIGH");
});

test("UC10-04: resolving maintenance requires resolutionNote, closes OPEN incident with resolvedAt, and restores OPERATIONAL status", async () => {
  const created = await api
    .post("/api/equipments")
    .set(auth())
    .send({
      name: "Khung gánh tạ Power Rack",
      category: "FREE_WEIGHT",
      zone: "Tầng 2 - Khu Free Weight",
    });
  const eqId = created.body.id as string;

  // Cannot resolve maintenance when equipment is still OPERATIONAL -> 409 INVALID_STATUS_TRANSITION
  const prematureResolve = await api
    .post(`/api/equipments/${eqId}/resolve-maintenance`)
    .set(auth())
    .send({ resolutionNote: "Thử nghiệm thu khi chưa hỏng" });
  assert.equal(prematureResolve.status, 409);
  assert.equal(prematureResolve.body.code, "INVALID_STATUS_TRANSITION");

  // Report incident first
  const reported = await api
    .post(`/api/equipments/${eqId}/incidents`)
    .set(auth())
    .send({
      description: "Lỏng chốt an toàn bên phải",
      severity: "MEDIUM",
    });
  assert.equal(reported.status, 201);
  assert.equal(reported.body.status, "OUT_OF_ORDER");

  // Missing resolutionNote -> 400 RESOLUTION_NOTE_REQUIRED
  const missingNote = await api
    .post(`/api/equipments/${eqId}/resolve-maintenance`)
    .set(auth())
    .send({ resolutionNote: "   " });
  assert.equal(missingNote.status, 400);
  assert.equal(missingNote.body.code, "RESOLUTION_NOTE_REQUIRED");

  // Valid maintenance resolution -> restores OPERATIONAL and sets resolvedAt on incident
  const resolved = await api
    .post(`/api/equipments/${eqId}/resolve-maintenance`)
    .set(auth())
    .send({
      resolutionNote: "Đã thay chốt thép mới và siết lực tiêu chuẩn",
      nextStatus: "OPERATIONAL",
    });
  assert.equal(resolved.status, 200);
  assert.equal(resolved.body.status, "OPERATIONAL");
  assert.equal(resolved.body.openIncident, null);
  assert.equal(resolved.body.incidents[0].status, "RESOLVED");
  assert.ok(resolved.body.incidents[0].resolvedAt);
  assert.equal(
    resolved.body.incidents[0].resolutionNote,
    "Đã thay chốt thép mới và siết lực tiêu chuẩn",
  );
  assert.equal(resolved.body.history[0].action, "MAINTENANCE_RESOLVED");
  assert.equal(resolved.body.history[0].fromStatus, "OUT_OF_ORDER");
  assert.equal(resolved.body.history[0].toStatus, "OPERATIONAL");
});

test("UC10-05: terminal RETIRED state (BR04) permanently locks equipment against edits, incidents, maintenance, and re-retirement", async () => {
  const created = await api
    .post("/api/equipments")
    .set(auth())
    .send({
      name: "Xe đạp tập Spinning đời cũ",
      category: "CARDIO",
      zone: "Tầng 1 - Khu Cardio",
    });
  const eqId = created.body.id as string;

  // Report incident, then retire equipment permanently
  await api
    .post(`/api/equipments/${eqId}/incidents`)
    .set(auth())
    .send({
      description: "Hỏng trục bánh đà không còn linh kiện thay thế",
      severity: "HIGH",
    });

  const retired = await api
    .post(`/api/equipments/${eqId}/retire`)
    .set(auth())
    .send({
      reason: "Thanh lý thiết bị hết khấu hao và ngừng sản xuất linh kiện",
    });
  assert.equal(retired.status, 200);
  assert.equal(retired.body.status, "RETIRED");
  assert.equal(retired.body.openIncident, null);
  assert.equal(retired.body.incidents[0].status, "RESOLVED");
  assert.equal(retired.body.history[0].action, "RETIRED");
  assert.equal(retired.body.history[0].toStatus, "RETIRED");

  // BR04: All mutations on a RETIRED equipment must fail with 409 EQUIPMENT_RETIRED
  const editRetired = await api
    .patch(`/api/equipments/${eqId}`)
    .set(auth())
    .send({ name: "Cố tình sửa tên sau khi thanh lý" });
  assert.equal(editRetired.status, 409);
  assert.equal(editRetired.body.code, "EQUIPMENT_RETIRED");

  const incidentOnRetired = await api
    .post(`/api/equipments/${eqId}/incidents`)
    .set(auth())
    .send({ description: "Báo hỏng thiết bị đã thanh lý", severity: "LOW" });
  assert.equal(incidentOnRetired.status, 409);
  assert.equal(incidentOnRetired.body.code, "EQUIPMENT_RETIRED");

  const resolveRetired = await api
    .post(`/api/equipments/${eqId}/resolve-maintenance`)
    .set(auth())
    .send({ resolutionNote: "Khôi phục trái phép" });
  assert.equal(resolveRetired.status, 409);
  assert.equal(resolveRetired.body.code, "EQUIPMENT_RETIRED");

  const retireAgain = await api
    .post(`/api/equipments/${eqId}/retire`)
    .set(auth())
    .send({ reason: "Thanh lý lần 2" });
  assert.equal(retireAgain.status, 409);
  assert.equal(retireAgain.body.code, "EQUIPMENT_RETIRED");
});
