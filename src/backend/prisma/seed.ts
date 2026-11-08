import "dotenv/config";
import { PrismaClient, type AccountStatus, type Role } from "@prisma/client";
import { hashPassword } from "../src/modules/auth/password";

const seedDatabaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
const db = new PrismaClient({
  datasources: seedDatabaseUrl ? { db: { url: seedDatabaseUrl } } : undefined,
});
const password = process.env.SEED_PASSWORD;
const connection = new URL(
  seedDatabaseUrl || "postgresql://invalid/invalid",
);
if (!password || password.length < 12)
  throw new Error(
    "Set SEED_PASSWORD (at least 12 characters) in apps/api/.env.",
  );
const isLocalDb =
  ["localhost", "127.0.0.1"].includes(connection.hostname) &&
  ["/fithub", "/fithub_test"].includes(connection.pathname);
const isSupabaseDb =
  connection.hostname.endsWith(".supabase.com") ||
  connection.hostname.endsWith(".supabase.co");
if (!isLocalDb && !isSupabaseDb) {
  throw new Error(
    "Demo seed is limited to local fithub/fithub_test or Supabase project DB.",
  );
}
const verifiedAt = new Date("2026-11-01T01:00:00Z");
const users: {
  email: string;
  phone: string;
  displayName: string;
  role: Role;
  status: AccountStatus;
  memberCode?: string;
}[] = [
  {
    email: "admin@fithub.vn",
    phone: "0900000001",
    displayName: "Nguyễn Hữu Quyền",
    role: "ADMIN",
    status: "ACTIVE",
  },
  {
    email: "trainer@fithub.vn",
    phone: "0900000002",
    displayName: "Huấn luyện viên mẫu",
    role: "TRAINER",
    status: "ACTIVE",
  },
  {
    email: "minhanh@example.com",
    phone: "0901234567",
    displayName: "Nguyễn Minh Anh",
    role: "MEMBER",
    status: "ACTIVE",
    memberCode: "HV001",
  },
  {
    email: "hoangnam@example.com",
    phone: "0902345678",
    displayName: "Trần Hoàng Nam",
    role: "MEMBER",
    status: "ACTIVE",
    memberCode: "HV002",
  },
  {
    email: "thuha@example.com",
    phone: "0903456789",
    displayName: "Lê Thu Hà",
    role: "MEMBER",
    status: "PENDING_VERIFY",
    memberCode: "HV003",
  },
  {
    email: "expired@example.com",
    phone: "0904567890",
    displayName: "Hội viên gói hết hạn",
    role: "MEMBER",
    status: "ACTIVE",
    memberCode: "HV004",
  },
  {
    email: "locked@example.com",
    phone: "0905678901",
    displayName: "Hội viên bị khóa",
    role: "MEMBER",
    status: "LOCKED",
    memberCode: "HV005",
  },
];

async function main() {
  // Hash before opening the transaction. An existing account is never reset by re-seeding.
  const hashes = await Promise.all(
    users.map((user) =>
      user.status === "PENDING_VERIFY" ? null : hashPassword(password!),
    ),
  );
  await db.$transaction(
    async (tx) => {
      for (const [index, definition] of users.entries()) {
        const { memberCode, ...user } = definition;
        const account = await tx.user.upsert({
          where: { email: user.email },
          update: {},
          create: {
            ...user,
            passwordHash: hashes[index],
            verifiedAt: user.status === "PENDING_VERIFY" ? null : verifiedAt,
          },
        });
        if (memberCode)
          await tx.memberProfile.upsert({
            where: { memberCode },
            update: {},
            create: {
              userId: account.id,
              memberCode,
              dateOfBirth:
                memberCode === "HV001"
                  ? new Date("2000-03-19T00:00:00Z")
                  : null,
            },
          });
      }
      for (const item of [
        {
          code: "GYM01",
          name: "Gym 1 tháng",
          durationMonths: 1,
          price: 500000,
        },
        {
          code: "GYM03",
          name: "Gym 3 tháng",
          durationMonths: 3,
          price: 1350000,
        },
        {
          code: "GYM06",
          name: "Gym 6 tháng",
          durationMonths: 6,
          price: 2400000,
        },
        {
          code: "GYM12",
          name: "Gym 12 tháng",
          durationMonths: 12,
          price: 4500000,
        },
      ])
        await tx.package.upsert({
          where: { code: item.code },
          update: {},
          create: item,
        });

      const admin = await tx.user.findUniqueOrThrow({
        where: { email: "admin@fithub.vn" },
      });
      const samples = [
        {
          member: "HV002",
          package: "GYM03",
          code: "DK0000",
          paymentCode: "GD0000",
          requestId: "00000000-0000-4000-8000-000000000001",
          key: "00000000-0000-4000-8000-000000000101",
          start: "2026-11-01",
          end: "2027-02-01",
          status: "ACTIVE" as const,
        },
        {
          member: "HV004",
          package: "GYM01",
          code: "DK_EXPIRED",
          paymentCode: "GD_EXPIRED",
          requestId: "00000000-0000-4000-8000-000000000002",
          key: "00000000-0000-4000-8000-000000000102",
          start: "2026-10-01",
          end: "2026-11-01",
          status: "EXPIRED" as const,
        },
      ];
      for (const sample of samples) {
        if (await tx.membership.findUnique({ where: { code: sample.code } }))
          continue;
        const member = await tx.memberProfile.findUniqueOrThrow({
          where: { memberCode: sample.member },
        });
        const pack = await tx.package.findUniqueOrThrow({
          where: { code: sample.package },
        });
        const membership = await tx.membership.create({
          data: {
            code: sample.code,
            requestId: sample.requestId,
            memberId: member.id,
            packageId: pack.id,
            packageNameSnapshot: pack.name,
            durationMonthsSnapshot: pack.durationMonths,
            priceSnapshot: pack.price,
            grantsGymAccessSnapshot: pack.grantsGymAccess,
            startsOn: new Date(`${sample.start}T00:00:00Z`),
            endsBefore: new Date(`${sample.end}T00:00:00Z`),
            status: sample.status,
          },
        });
        const paid = await tx.payment.create({
          data: {
            code: sample.paymentCode,
            membershipId: membership.id,
            amount: pack.price,
            idempotencyKey: sample.key,
            status: "CONFIRMED",
            confirmedById: admin.id,
            confirmedAt: new Date(`${sample.start}T01:30:00Z`),
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
    },
    { timeout: 15000 },
  );
  console.log(
    "Demo seed complete. Existing records and passwords were preserved.",
  );
  console.log({
    users: await db.user.count(),
    members: await db.memberProfile.count(),
    packages: await db.package.count(),
    memberships: await db.membership.count(),
    payments: await db.payment.count(),
  });
}
main()
  .catch((error) => {
    console.error("Seed failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
