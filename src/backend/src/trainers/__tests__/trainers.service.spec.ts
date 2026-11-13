import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, mock, test } from "node:test";
import { ConflictException } from "@nestjs/common";
import { PrismaClient, type WorkingSlot } from "@prisma/client";
import type { PrismaService } from "../../database/prisma.service";
import { WorkingSlotsService } from "../../modules/trainers/working-slots.service";
import { TrainersService } from "../../modules/trainers/trainers.service";
import { profileInput } from "../../modules/trainers/trainers.validation";

const actorId = randomUUID();
const trainerId = randomUUID();
const range = { date: "2030-05-15", startTime: "08:00", endTime: "09:00" };
const slot: WorkingSlot = {
  id: randomUUID(),
  trainerId,
  workDate: new Date(range.date),
  startTime: new Date("2030-05-15T01:00:00Z"),
  endTime: new Date("2030-05-15T02:00:00Z"),
  status: "OPEN",
  memberId: null,
  unavailableReason: null,
};

function scheduleFixture(existing?: WorkingSlot) {
  const tx = {
    $queryRaw: mock.fn(async () => []),
    workingSlot: {
      findFirst: mock.fn(
        async (_query: unknown) => existing && { id: existing.id },
      ),
      findUnique: mock.fn(async (_query: unknown) => existing),
      createManyAndReturn: mock.fn(async (_query: unknown) => [slot]),
      delete: mock.fn(),
    },
    auditLog: { createMany: mock.fn(), create: mock.fn() },
  };
  const service = new WorkingSlotsService({
    $transaction: (run: (transaction: typeof tx) => unknown) => run(tx),
  } as unknown as PrismaService);
  service.now = () => new Date("2030-05-10T00:00:00Z");
  return { service, tx };
}

function conflict(code: string) {
  return (e: unknown) =>
    e instanceof ConflictException &&
    e.getStatus() === 409 &&
    (e.getResponse() as { code?: string }).code === code;
}

// PostgreSQL owns profile creation through an AFTER INSERT trigger.
const db = new PrismaClient();
after(() => db.$disconnect());
test("UC06 — tạo User TRAINER tự động tạo đúng một hồ sơ liên kết", async () => {
  const url = new URL(
    process.env.DATABASE_URL || "postgresql://invalid/invalid",
  );
  assert.ok(
    ["localhost", "127.0.0.1"].includes(url.hostname) &&
      url.pathname === "/fithub_test",
  );
  const rollback = new Error("rollback fixture");
  await assert.rejects(
    db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          displayName: "FITHUB-405",
          role: "TRAINER",
          email: randomUUID() + "@example.com",
        },
      });
      const profiles = await tx.trainerProfile.findMany({
        where: { userId: user.id },
      });
      assert.equal(profiles.length, 1);
      assert.ok(profiles[0].trainerCode);
      assert.equal(profiles[0].version, 0);
      assert.equal(profiles[0].workStatus, "ACTIVE");
      throw rollback;
    }),
    (e) => e === rollback,
  );
});

test("UC06 — PT cập nhật ON_LEAVE trên hồ sơ và giữ trạng thái tài khoản ACTIVE", async () => {
  const input = profileInput({
    bio: "Huấn luyện thể lực",
    specialties: ["Gym"],
    experienceYears: 3,
    version: 0,
    workStatus: "ON_LEAVE",
  });
  const tx = {
    trainerProfile: {
      updateMany: mock.fn(async (_query: unknown) => ({ count: 1 })),
      findUniqueOrThrow: async () => ({
        id: trainerId,
        userId: actorId,
        trainerCode: "PT001",
        ...input,
        version: 1,
        user: { status: "ACTIVE", displayName: "PT", email: null, phone: null },
        avatarUrl: null,
        _count: { certifications: 0 },
        certifications: [],
      }),
    },
    auditLog: { create: mock.fn() },
  };
  const trainers = new TrainersService({
    $transaction: (run: (transaction: typeof tx) => unknown) => run(tx),
  } as unknown as PrismaService);
  const result = await trainers.update(actorId, trainerId, input);
  assert.deepEqual(tx.trainerProfile.updateMany.mock.calls[0].arguments[0], {
    where: { id: trainerId, userId: actorId, version: 0 },
    data: {
      bio: input.bio,
      specialties: input.specialties,
      experienceYears: 3,
      workStatus: "ON_LEAVE",
      version: { increment: 1 },
    },
  });
  assert.equal(result.workStatus, "ON_LEAVE");
  assert.equal(result.accountStatus, "ACTIVE");
  assert.equal(result.version, 1);
});

test("UC07 — thêm ca OPEN cho PT đang hoạt động", async () => {
  const { service, tx } = scheduleFixture();
  const result = await service.register(actorId, trainerId, range);
  assert.deepEqual(
    tx.workingSlot.createManyAndReturn.mock.calls[0].arguments[0],
    {
      data: [
        {
          trainerId,
          workDate: slot.workDate,
          startTime: slot.startTime,
          endTime: slot.endTime,
        },
      ],
    },
  );
  assert.equal(result.slots.length, 1);
  assert.equal(result.slots[0].status, "OPEN");
  assert.equal(result.slots[0].trainerId, trainerId);
  assert.equal(tx.auditLog.createMany.mock.callCount(), 1);
});

test("UC07 — trùng PT, ngày và giờ bắt đầu trả 409 SLOT_OVERLAP", async () => {
  const { service, tx } = scheduleFixture(slot);
  await assert.rejects(
    service.register(actorId, trainerId, range),
    conflict("SLOT_OVERLAP"),
  );
  assert.deepEqual(tx.workingSlot.findFirst.mock.calls[0].arguments[0], {
    where: {
      trainerId,
      startTime: { lt: new Date("2030-05-15T02:15:00Z") },
      endTime: { gt: new Date("2030-05-15T00:45:00Z") },
    },
    select: { id: true },
  });
  assert.equal(tx.workingSlot.createManyAndReturn.mock.callCount(), 0);
  assert.equal(tx.auditLog.createMany.mock.callCount(), 0);
});

test("UC07 — xóa ca có hội viên đặt trả 409 SLOT_ALREADY_BOOKED", async () => {
  const { service, tx } = scheduleFixture({
    ...slot,
    status: "BOOKED",
    memberId: randomUUID(),
  });
  await assert.rejects(
    service.change(actorId, trainerId, slot.id, null),
    conflict("SLOT_ALREADY_BOOKED"),
  );
  assert.deepEqual(tx.workingSlot.findUnique.mock.calls[0].arguments[0], {
    where: { id: slot.id },
  });
  assert.equal(tx.workingSlot.delete.mock.callCount(), 0);
  assert.equal(tx.auditLog.create.mock.callCount(), 0);
});
