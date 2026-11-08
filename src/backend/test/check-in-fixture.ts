import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { hashPassword } from "../src/modules/auth/password";

// Imported only by Playwright tests. Never mounted in the application.
export async function checkInFixture(hasPackage = true) {
  for (const value of [process.env.DATABASE_URL, process.env.DIRECT_URL]) {
    const u = new URL(value || "postgresql://invalid/invalid");
    if (
      !["localhost", "127.0.0.1"].includes(u.hostname) ||
      u.pathname != "/fithub_test"
    )
      throw Error("Fixture requires isolated fithub_test.");
  }
  const db = new PrismaClient();
  try {
    const email = `qr-e2e-${randomUUID()}@example.com`,
      password = "QRTest!2026";
    const user = await db.user.create({
      data: {
        email,
        displayName: "Hội viên QR",
        passwordHash: await hashPassword(password),
        role: "MEMBER",
        status: "ACTIVE",
        verifiedAt: new Date(),
      },
    });
    const member = await db.memberProfile.create({
      data: { userId: user.id, memberCode: `QR-${randomUUID().slice(0, 8)}` },
    });
    if (hasPackage) {
      const pack = await db.package.findUniqueOrThrow({
        where: { code: "GYM03" },
      });
      const admin = await db.user.findUniqueOrThrow({
        where: { email: "admin@fithub.vn" },
      });
      const start = new Date(
        new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10) +
          "T00:00:00Z",
      );
      await db.$transaction(async (tx) => {
        const m = await tx.membership.create({
          data: {
            code: randomUUID(),
            requestId: randomUUID(),
            memberId: member.id,
            packageId: pack.id,
            packageNameSnapshot: pack.name,
            priceSnapshot: pack.price,
            durationMonthsSnapshot: 3,
            grantsGymAccessSnapshot: true,
            status: "ACTIVE",
            startsOn: start,
            endsBefore: new Date(start.getTime() + 90 * 86400_000),
          },
        });
        await tx.payment.create({
          data: {
            code: randomUUID(),
            idempotencyKey: randomUUID(),
            membershipId: m.id,
            amount: pack.price,
            status: "CONFIRMED",
            confirmedById: admin.id,
            confirmedAt: new Date(),
          },
        });
      });
    }
    return { email, password, memberId: member.id };
  } finally {
    await db.$disconnect();
  }
}
