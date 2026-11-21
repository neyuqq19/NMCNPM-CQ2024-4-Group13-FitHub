import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Package, type User } from "@prisma/client";
import { hashPassword } from "../src/modules/auth/password";

/**
 * UC05 test fixtures.
 * SAFETY: this script refuses to run unless connected to local fithub_test.
 * It never creates or changes the existing ADMIN account.
 */
const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Set DIRECT_URL or DATABASE_URL before running UC05 seed.");
}

const connection = new URL(databaseUrl);
const isUc05TestDb =
  ["localhost", "127.0.0.1"].includes(connection.hostname) &&
  connection.pathname === "/fithub_test";
if (!isUc05TestDb) {
  throw new Error(
    `Refusing to seed: expected local database /fithub_test, got ${connection.hostname}${connection.pathname}.`,
  );
}

const password = process.env.SEED_PASSWORD;
if (!password || password.length < 12) {
  throw new Error(
    "Set SEED_PASSWORD to a test password of at least 12 characters.",
  );
}

const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

// The team's UC05 guide uses T = 17/11/2026 as its example.
// Override with UC05_START_DATE=YYYY-MM-DD when the actual test date changes.
const TEST_START_DATE = process.env.UC05_START_DATE || "2026-11-17";

function dateOnly(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

function addMonths(ymd: string, months: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const firstOfTargetMonth = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(
      firstOfTargetMonth.getUTCFullYear(),
      firstOfTargetMonth.getUTCMonth() + 1,
      0,
    ),
  ).getUTCDate();
  firstOfTargetMonth.setUTCDate(Math.min(day, lastDay));
  return firstOfTargetMonth.toISOString().slice(0, 10);
}

const accountFixtures = [
  { key: "M1", email: "m1.uc05@example.com", memberCode: "HV001009" },
  { key: "M2", email: "uc05.m2@example.com", memberCode: "HV900502" },
  { key: "M3", email: "uc05.m3@example.com", memberCode: "HV900503" },
  { key: "M4", email: "uc05.m4@example.com", memberCode: "HV900504" },
  { key: "M5", email: "uc05.m5@example.com", memberCode: "HV900505" },
  { key: "M6", email: "uc05.m6@example.com", memberCode: "HV900506" },
  // M7 is reserved for rerunning TC-UC05-001 from a clean state (no Membership).
  { key: "M7", email: "uc05.m7@example.com", memberCode: "HV900507" },
] as const;

const membershipFixtures = [
  { member: "M2", packageCode: "GYM01", months: 1 },
  { member: "M3", packageCode: "GYM12", months: 12 },
  { member: "M4", packageCode: "GYM03", months: 3 },
  { member: "M5", packageCode: "GYM12", months: 12 },
  { member: "M6", packageCode: "GYM12", months: 12 },
] as const;

async function main() {
  const passwordHashes = await Promise.all(
    accountFixtures.map(() => hashPassword(password)),
  );
  const verifiedAt = new Date();

  const result = await db.$transaction(
    async (tx) => {
      const admin = await tx.user.findUnique({
        where: { email: "admin@fithub.vn" },
      });
      if (!admin || admin.role !== "ADMIN" || admin.status !== "ACTIVE") {
        throw new Error(
          "admin@fithub.vn was not found as an ACTIVE ADMIN; no fixtures were created.",
        );
      }

      const members = new Map<string, { id: string; memberCode: string }>();

      for (const [index, fixture] of accountFixtures.entries()) {
        const existingUser = await tx.user.findUnique({
          where: { email: fixture.email },
          include: { memberProfile: true },
        });
        const existingProfileByCode = await tx.memberProfile.findUnique({
          where: { memberCode: fixture.memberCode },
        });

        if (existingUser && existingUser.role !== "MEMBER") {
          throw new Error(`${fixture.email} already exists but is not a MEMBER.`);
        }
        if (
          existingUser?.memberProfile &&
          existingUser.memberProfile.memberCode !== fixture.memberCode
        ) {
          throw new Error(
            `${fixture.email} is already linked to ${existingUser.memberProfile.memberCode}; refusing to change it.`,
          );
        }
        if (
          existingProfileByCode &&
          existingProfileByCode.userId !== existingUser?.id
        ) {
          throw new Error(
            `${fixture.memberCode} is already assigned to another user; refusing to reuse it.`,
          );
        }
        let user: User;
        if (existingUser) {
          // M1 was previously created through Web Admin as PENDING_VERIFY.
          // Promote only this explicitly identified local test account so it
          // satisfies the UC05 prerequisite (ACTIVE and email verified).
          if (fixture.key === "M1" && existingUser.status === "PENDING_VERIFY") {
            user = await tx.user.update({
              where: { id: existingUser.id },
              data: {
                status: "ACTIVE",
                verifiedAt,
                passwordHash: passwordHashes[index],
              },
            });
          } else {
            if (
              existingUser.status !== "ACTIVE" ||
              !existingUser.verifiedAt ||
              !existingUser.passwordHash
            ) {
              throw new Error(
                `${fixture.email} already exists but is not ACTIVE, verified, and password-ready. Check it manually before rerunning the seed.`,
              );
            }
            user = existingUser;
          }
        } else {
          user = await tx.user.create({
            data: {
              email: fixture.email,
              displayName: `Hội viên kiểm thử UC05 - ${fixture.key}`,
              role: "MEMBER",
              status: "ACTIVE",
              verifiedAt,
              passwordHash: passwordHashes[index],
            },
          });
        }

        const profile =
          existingUser?.memberProfile ??
          existingProfileByCode ??
          (await tx.memberProfile.create({
            data: {
              userId: user.id,
              memberCode: fixture.memberCode,
            },
          }));

        members.set(fixture.key, {
          id: profile.id,
          memberCode: profile.memberCode,
        });
      }

      const packageCodes = ["GYM01", "GYM03", "GYM12"] as const;
      const packages = new Map<string, Package>();
      for (const code of packageCodes) {
        const pack = await tx.package.findUnique({ where: { code } });
        if (!pack || !pack.isActive) {
          throw new Error(
            `Package ${code} is missing or inactive. No memberships were created.`,
          );
        }
        packages.set(code, pack);
      }

      // Validate the price/duration baseline recorded in the team's UC05 guide.
      const expectedPackages = {
        GYM01: { months: 1, price: 500000 },
        GYM03: { months: 3, price: 1350000 },
        GYM12: { months: 12, price: 4500000 },
      } as const;
      for (const [code, expected] of Object.entries(expectedPackages)) {
        const pack = packages.get(code);
        if (
          !pack ||
          pack.durationMonths !== expected.months ||
          Number(pack.price) !== expected.price
        ) {
          throw new Error(
            `${code} does not match the UC05 guide price/duration. Check Package before seeding.`,
          );
        }
      }

      const createdMemberships: string[] = [];
      const preservedMemberships: string[] = [];

      for (const fixture of membershipFixtures) {
        const member = members.get(fixture.member);
        const pack = packages.get(fixture.packageCode);
        if (!member || !pack) {
          throw new Error(`Missing member/package for ${fixture.member}.`);
        }

        const membershipCode = `UC05-${fixture.member}-BASE`;
        const paymentCode = `UC05-${fixture.member}-PAY`;
        let membership = await tx.membership.findUnique({
          where: { code: membershipCode },
          include: { payment: true },
        });

        if (membership) {
          if (
            membership.memberId !== member.id ||
            membership.packageId !== pack.id
          ) {
            throw new Error(
              `${membershipCode} already exists but belongs to different data; refusing to modify it.`,
            );
          }
          preservedMemberships.push(membershipCode);
        } else {
          const otherActiveMembership = await tx.membership.findFirst({
            where: {
              memberId: member.id,
              status: { in: ["ACTIVE", "FROZEN", "SCHEDULED"] },
            },
          });
          if (otherActiveMembership) {
            throw new Error(
              `${fixture.member} already has membership ${otherActiveMembership.code}; refusing to add a second active package.`,
            );
          }

          const endsBefore = addMonths(TEST_START_DATE, fixture.months);
          membership = await tx.membership.create({
            data: {
              code: membershipCode,
              requestId: randomUUID(),
              memberId: member.id,
              packageId: pack.id,
              packageNameSnapshot: pack.name,
              durationMonthsSnapshot: pack.durationMonths,
              priceSnapshot: pack.price,
              accessWindowSnapshot: pack.accessWindow,
              grantsGymAccessSnapshot: pack.grantsGymAccess,
              ptSessionsSnapshot: pack.ptSessionsIncluded,
              ptSessionsRemaining: pack.ptSessionsIncluded,
              status: "ACTIVE",
              startsOn: dateOnly(TEST_START_DATE),
              endsBefore: dateOnly(endsBefore),
            },
            include: { payment: true },
          });
          createdMemberships.push(membershipCode);
        }

        // Existing payments are left untouched. New fixture memberships receive a
        // confirmed CASH payment, matching the established demo-seed convention.
        if (!membership.payment) {
          const paymentCodeAlreadyUsed = await tx.payment.findUnique({
            where: { code: paymentCode },
          });
          if (paymentCodeAlreadyUsed) {
            throw new Error(
              `${paymentCode} already exists but is not linked to ${membershipCode}.`,
            );
          }

          const paid = await tx.payment.create({
            data: {
              code: paymentCode,
              membershipId: membership.id,
              amount: pack.price,
              method: "CASH",
              status: "CONFIRMED",
              idempotencyKey: randomUUID(),
              confirmedById: admin.id,
              confirmedAt: dateOnly(TEST_START_DATE),
            },
          });
          await tx.auditLog.create({
            data: {
              actorId: admin.id,
              action: "DEMO_SEED_PAYMENT",
              entityType: "Payment",
              entityId: paid.id,
              changedFields: ["status", "confirmedAt"],
            },
          });
        }
      }

      return {
        createdMembers: accountFixtures.map((x) => `${x.key}: ${x.email} / ${x.memberCode}`),
        createdMemberships,
        preservedMemberships,
        admin: admin.email,
        testStartDate: TEST_START_DATE,
      };
    },
    { timeout: 15000 },
  );

  console.log("UC05 seed completed on local fithub_test.");
  console.log(JSON.stringify(result, null, 2));
  console.log("M1 and M7 are intentionally not assigned fixture memberships by this seed.");
  console.log("No FreezePeriod records were created; create those through the UC05 UI steps.");
  console.log("New accounts and promoted M1 use SEED_PASSWORD; existing ACTIVE fixture accounts keep their current passwords.");
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("UC05 seed failed:", message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
