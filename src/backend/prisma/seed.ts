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
          ptSessionsIncluded: 0,
        },
        {
          code: "GYM03",
          name: "Gym 3 tháng",
          durationMonths: 3,
          price: 1350000,
          ptSessionsIncluded: 0,
        },
        {
          code: "GYM06",
          name: "Gym 6 tháng + PT",
          durationMonths: 6,
          price: 2400000,
          ptSessionsIncluded: 6,
        },
        {
          code: "GYM12",
          name: "Gym 12 tháng VIP",
          durationMonths: 12,
          price: 4500000,
          ptSessionsIncluded: 12,
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
            ptSessionsSnapshot: pack.ptSessionsIncluded,
            ptSessionsRemaining: pack.ptSessionsIncluded,
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

      const equipmentSamples = [
        {
          code: "EQ-CARDIO-001",
          name: "Máy chạy bộ Technogym Excite",
          category: "CARDIO" as const,
          zone: "Tầng 1 - Khu Cardio",
          status: "OPERATIONAL" as const,
          purchasedAt: "2026-01-15",
          warrantyUntil: "2028-01-15",
          notes: "Bảo dưỡng định kỳ hàng quý.",
        },
        {
          code: "EQ-CARDIO-002",
          name: "Xe đạp tập trượt tuyết Elliptical",
          category: "CARDIO" as const,
          zone: "Tầng 1 - Khu Cardio",
          status: "OUT_OF_ORDER" as const,
          purchasedAt: "2026-01-15",
          warrantyUntil: "2028-01-15",
          notes: "Đang chờ thay dây curoa chính hãng.",
          openIncident: {
            description: "Đứt dây curoa truyền động, phát tiếng kêu lớn khi đạp",
            severity: "HIGH" as const,
          },
        },
        {
          code: "EQ-STRENGTH-001",
          name: "Giàn tạ đa năng Smith Machine",
          category: "STRENGTH" as const,
          zone: "Tầng 2 - Khu Máy khối",
          status: "OPERATIONAL" as const,
          purchasedAt: "2026-02-10",
          warrantyUntil: "2029-02-10",
          notes: "Kiểm tra cáp và khóa an toàn mỗi tuần.",
        },
        {
          code: "EQ-STRENGTH-002",
          name: "Máy ép ngực Chest Press",
          category: "STRENGTH" as const,
          zone: "Tầng 2 - Khu Máy khối",
          status: "OPERATIONAL" as const,
          purchasedAt: "2026-02-10",
          warrantyUntil: "2029-02-10",
          notes: null,
        },
        {
          code: "EQ-FREE_WEIGHT-001",
          name: "Ghế đẩy tạ đòn Olympic Bench",
          category: "FREE_WEIGHT" as const,
          zone: "Tầng 2 - Khu Tạ rời",
          status: "RETIRED" as const,
          purchasedAt: "2024-05-01",
          warrantyUntil: "2026-05-01",
          notes: "Đã thanh lý do nứt khung chịu lực chính.",
        },
        {
          code: "EQ-FUNCTIONAL-001",
          name: "Khung tập đa năng Cable Crossover",
          category: "FUNCTIONAL" as const,
          zone: "Tầng 3 - Khu Functional",
          status: "OPERATIONAL" as const,
          purchasedAt: "2026-03-20",
          warrantyUntil: "2028-03-20",
          notes: null,
        },
      ];

      for (const item of equipmentSamples) {
        const existing = await tx.equipment.findUnique({
          where: { code: item.code },
        });
        if (existing) continue;

        const eq = await tx.equipment.create({
          data: {
            code: item.code,
            name: item.name,
            category: item.category,
            zone: item.zone,
            status: item.status,
            qrCodePayload: `FITHUB://EQUIPMENT/${item.code}`,
            purchasedAt: new Date(`${item.purchasedAt}T00:00:00Z`),
            warrantyUntil: new Date(`${item.warrantyUntil}T00:00:00Z`),
            notes: item.notes,
          },
        });

        await tx.equipmentHistory.create({
          data: {
            equipmentId: eq.id,
            actorId: admin.id,
            action: "CREATED",
            fromStatus: null,
            toStatus: "OPERATIONAL",
            note: "Nhập thiết bị mới vào hệ thống (Seed)",
          },
        });

        if (item.openIncident) {
          await tx.equipmentIncident.create({
            data: {
              equipmentId: eq.id,
              reportedById: admin.id,
              description: item.openIncident.description,
              severity: item.openIncident.severity,
              status: "OPEN",
            },
          });
          await tx.equipmentHistory.create({
            data: {
              equipmentId: eq.id,
              actorId: admin.id,
              action: "INCIDENT_REPORTED",
              fromStatus: "OPERATIONAL",
              toStatus: "OUT_OF_ORDER",
              note: item.openIncident.description,
            },
          });
        } else if (item.status === "RETIRED") {
          await tx.equipmentHistory.create({
            data: {
              equipmentId: eq.id,
              actorId: admin.id,
              action: "RETIRED",
              fromStatus: "OPERATIONAL",
              toStatus: "RETIRED",
              note: item.notes || "Thanh lý thiết bị ngưng sử dụng",
            },
          });
        }
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
    equipments: await db.equipment.count(),
  });
}
main()
  .catch((error) => {
    console.error("Seed failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
