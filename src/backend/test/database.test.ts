import "dotenv/config";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient, Prisma } from "@prisma/client";

const parsed = new URL(
  process.env.DATABASE_URL || "postgresql://invalid/invalid",
);
if (
  !["localhost", "127.0.0.1"].includes(parsed.hostname) ||
  parsed.pathname !== "/fithub_test"
)
  throw new Error(
    "Tests require the dedicated local fithub_test database. Run npm run db:test.",
  );
const db = new PrismaClient();
after(() => db.$disconnect());
const rollback = new Error("ROLLBACK_TEST_FIXTURE");
const passwordHash = `scrypt:${"a".repeat(32)}:${"b".repeat(128)}`;
const start = new Date("2026-11-06T00:00:00Z");
const end = new Date("2026-12-06T00:00:00Z");
type Tx = Prisma.TransactionClient;
function userData() {
  return {
    email: `${randomUUID()}@example.com`,
    displayName: "Database test",
    passwordHash,
    status: "ACTIVE" as const,
    verifiedAt: start,
  };
}
async function fixture(tx: Tx) {
  const admin = await tx.user.create({
    data: { ...userData(), role: "ADMIN" },
  });
  const user = await tx.user.create({ data: userData() });
  const profile = await tx.memberProfile.create({
    data: { userId: user.id, memberCode: `TEST-${randomUUID()}` },
  });
  const pack = await tx.package.create({
    data: {
      code: randomUUID(),
      name: "Gym 1 tháng",
      price: 500000,
      durationMonths: 1,
    },
  });
  const membership = await tx.membership.create({
    data: {
      code: randomUUID(),
      requestId: randomUUID(),
      memberId: profile.id,
      packageId: pack.id,
      packageNameSnapshot: pack.name,
      durationMonthsSnapshot: pack.durationMonths,
      priceSnapshot: pack.price,
      grantsGymAccessSnapshot: true,
      startsOn: start,
      endsBefore: end,
    },
  });
  return { admin, user, profile, pack, membership };
}
async function confirmed(tx: Tx, f: Awaited<ReturnType<typeof fixture>>) {
  await tx.membership.update({
    where: { id: f.membership.id },
    data: { status: "ACTIVE" },
  });
  return tx.payment.create({
    data: {
      code: randomUUID(),
      membershipId: f.membership.id,
      amount: 500000,
      idempotencyKey: randomUUID(),
      status: "CONFIRMED",
      confirmedById: f.admin.id,
      confirmedAt: start,
    },
  });
}
// Each test rolls back its entire fixture. SET CONSTRAINTS checks deferred triggers before rollback.
async function inRollback(work: (tx: Tx) => Promise<void>) {
  try {
    await db.$transaction(async (tx) => {
      await work(tx);
      await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}
async function rejectsConstraint(
  work: (tx: Tx) => Promise<void>,
  name: string,
) {
  await assert.rejects(inRollback(work), (error) => {
    if (!(error instanceof Error)) return false;
    assert.match(error.message, new RegExp(name, "i"));
    return true;
  });
}

test("a pending counter account can omit password and verification", () =>
  inRollback(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: `${randomUUID()}@example.com`,
        displayName: "Pending account",
      },
    });
    assert.equal(user.status, "PENDING_VERIFY");
    assert.equal(user.passwordHash, null);
  }));
test("requires at least one contact", () =>
  rejectsConstraint(async (tx) => {
    await tx.user.create({ data: { displayName: "No contact" } });
  }, "user_contact_required"));
test("requires canonical lower-case email", () =>
  rejectsConstraint(async (tx) => {
    await tx.user.create({
      data: { email: "MixedCase@Example.com", displayName: "Bad email" },
    });
  }, "user_email_canonical"));
test("rejects duplicate phone across accounts", () =>
  rejectsConstraint(async (tx) => {
    const phone =
      "09" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    await tx.user.create({ data: { displayName: "A", phone } });
    await tx.user.create({ data: { displayName: "B", phone } });
  }, "Unique constraint"));
test("active accounts need verification and a password hash", () =>
  rejectsConstraint(async (tx) => {
    await tx.user.create({
      data: {
        email: `${randomUUID()}@example.com`,
        displayName: "Unverified",
        status: "ACTIVE",
      },
    });
  }, "user_active_verified"));
test("one account has only one member profile", () =>
  rejectsConstraint(async (tx) => {
    const f = await fixture(tx);
    await tx.memberProfile.create({
      data: { userId: f.user.id, memberCode: randomUUID() },
    });
  }, "Unique constraint"));
test("admin cannot be assigned a member profile", () =>
  rejectsConstraint(async (tx) => {
    const f = await fixture(tx);
    await tx.memberProfile.create({
      data: { userId: f.admin.id, memberCode: randomUUID() },
    });
  }, "requires a MEMBER"));
test("rejects negative package price", () =>
  rejectsConstraint(async (tx) => {
    await tx.package.create({
      data: {
        code: randomUUID(),
        name: "Invalid",
        durationMonths: 1,
        price: -1,
      },
    });
  }, "package_price_positive"));
test("rejects reversed membership dates", () =>
  rejectsConstraint(async (tx) => {
    const f = await fixture(tx);
    await tx.membership.update({
      where: { id: f.membership.id },
      data: { endsBefore: start },
    });
  }, "membership_period_valid"));
test("rejects activation without confirmed payment", () =>
  rejectsConstraint(async (tx) => {
    const f = await fixture(tx);
    await tx.membership.update({
      where: { id: f.membership.id },
      data: { status: "ACTIVE" },
    });
  }, "requires a confirmed payment"));
test("payment and membership activation succeed in one transaction", () =>
  inRollback(async (tx) => {
    const f = await fixture(tx);
    await confirmed(tx, f);
    await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
    assert.equal(
      await tx.payment.count({
        where: { membershipId: f.membership.id, status: "CONFIRMED" },
      }),
      1,
    );
  }));
test("rejects payment amount different from purchased price", () =>
  rejectsConstraint(async (tx) => {
    const f = await fixture(tx);
    await tx.membership.update({
      where: { id: f.membership.id },
      data: { status: "ACTIVE" },
    });
    await tx.payment.create({
      data: {
        code: randomUUID(),
        membershipId: f.membership.id,
        amount: 1,
        idempotencyKey: randomUUID(),
        status: "CONFIRMED",
        confirmedById: f.admin.id,
        confirmedAt: start,
      },
    });
  }, "inconsistent"));
test("member cannot confirm cash payment", () =>
  rejectsConstraint(async (tx) => {
    const f = await fixture(tx);
    await tx.payment.create({
      data: {
        code: randomUUID(),
        membershipId: f.membership.id,
        amount: 500000,
        idempotencyKey: randomUUID(),
        status: "CONFIRMED",
        confirmedById: f.user.id,
        confirmedAt: start,
      },
    });
  }, "requires an active admin"));
test("unverified member cannot receive confirmed payment", () =>
  rejectsConstraint(async (tx) => {
    const f = await fixture(tx);
    await tx.user.update({
      where: { id: f.user.id },
      data: { status: "PENDING_VERIFY", verifiedAt: null },
    });
    await confirmed(tx, f);
  }, "requires an active verified member"));
test("a registration cannot receive two payments", () =>
  rejectsConstraint(async (tx) => {
    const f = await fixture(tx);
    await confirmed(tx, f);
    await tx.payment.create({
      data: {
        code: randomUUID(),
        membershipId: f.membership.id,
        amount: 500000,
        idempotencyKey: randomUUID(),
      },
    });
  }, "Unique constraint"));
test("confirmed payment cannot be deleted", () =>
  rejectsConstraint(async (tx) => {
    const f = await fixture(tx);
    const p = await confirmed(tx, f);
    await tx.payment.delete({ where: { id: p.id } });
  }, "must be retained"));
test("purchased price is independent of catalog changes", () =>
  inRollback(async (tx) => {
    const f = await fixture(tx);
    await confirmed(tx, f);
    await tx.package.update({
      where: { id: f.pack.id },
      data: { price: 900000, name: "Changed catalog" },
    });
    const membership = await tx.membership.findUniqueOrThrow({
      where: { id: f.membership.id },
    });
    assert.equal(membership.priceSnapshot.toString(), "500000");
    assert.equal(membership.packageNameSnapshot, "Gym 1 tháng");
  }));
test("purchased terms cannot be rewritten", () =>
  rejectsConstraint(async (tx) => {
    const f = await fixture(tx);
    await confirmed(tx, f);
    await tx.membership.update({
      where: { id: f.membership.id },
      data: { priceSnapshot: 900000 },
    });
  }, "must be preserved"));
test("stale member edit does not overwrite another update", () =>
  inRollback(async (tx) => {
    const f = await fixture(tx);
    const first = await tx.memberProfile.updateMany({
      where: { id: f.profile.id, version: 0 },
      data: { address: "A", version: { increment: 1 } },
    });
    const stale = await tx.memberProfile.updateMany({
      where: { id: f.profile.id, version: 0 },
      data: { address: "B", version: { increment: 1 } },
    });
    assert.equal(first.count, 1);
    assert.equal(stale.count, 0);
  }));
test("rollback prevents a partial payment/activation", async () => {
  let code = "";
  await assert.rejects(
    db.$transaction(async (tx) => {
      const f = await fixture(tx);
      code = f.membership.code;
      await confirmed(tx, f);
      throw new Error("SIMULATED_FAILURE");
    }),
    /SIMULATED_FAILURE/,
  );
  assert.equal(await db.membership.count({ where: { code } }), 0);
});
