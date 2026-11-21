import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID, createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { hashPassword } from "../../backend/src/modules/auth/password";

const evidenceRoot = resolve(process.cwd(), "../../evidence/UC08");

function saveEvidenceJson(caseId: string, fileName: string, payload: unknown) {
  const dir = resolve(evidenceRoot, caseId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, fileName), JSON.stringify(payload, null, 2), "utf8");
}

async function loginWeb(page: Page, email: string) {
  await page.goto("/#/login");
  await page.getByLabel("Email hoặc số điện thoại").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("FitHubDemo!2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.getByRole("link", { name: "Lịch hẹn PT" }).click();
  await expect(page.getByRole("heading", { name: "Lịch hẹn PT" })).toBeVisible();
}

test("UC08 Web E2E: TC-UC08-001 (Web view), TC-UC08-005 (PT cancel <6h +1 compensation), TC-UC08-007 (PT cancel >=6h refund only) & TC-UC08-009 (Admin NO_SHOW)", async ({
  page,
  context,
}) => {
  test.slow();
  const db = new PrismaClient();
  const createdUserIds: string[] = [];
  const createdSlotIds: string[] = [];
  const createdAppointmentIds: string[] = [];

  try {
    const adminUser = await db.user.findUniqueOrThrow({
      where: { email: "admin@fithub.vn" },
    });
    const trainerProfile = await db.trainerProfile.findUniqueOrThrow({
      where: { trainerCode: "PT001" },
      include: { user: true },
    });
    const pack = await db.package.findUniqueOrThrow({
      where: { code: "GYM06" },
    });

    async function createTestMemberWithPt(label: string, initialPt: number) {
      const email = `uc08.web.${label.toLowerCase()}.${randomUUID().slice(0, 6)}@example.com`;
      const user = await db.user.create({
        data: {
          email,
          displayName: `Hội viên ${label}`,
          passwordHash: await hashPassword("FitHubDemo!2026"),
          role: "MEMBER",
          status: "ACTIVE",
          verifiedAt: new Date(),
        },
      });
      createdUserIds.push(user.id);

      const rawToken = randomUUID() + randomUUID();
      await db.session.create({
        data: {
          userId: user.id,
          tokenHash: createHash("sha256").update(rawToken).digest("hex"),
          deviceId: randomUUID(),
          requestId: randomUUID(),
          platform: "MOBILE",
          expiresAt: new Date(Date.now() + 86400_000),
        },
      });

      const profile = await db.memberProfile.create({
        data: {
          userId: user.id,
          memberCode: `HV08${randomUUID().slice(0, 4).toUpperCase()}`,
        },
      });

      const membership = await db.$transaction(async (tx) => {
        const m = await tx.membership.create({
          data: {
            code: `DK08${randomUUID().slice(0, 5).toUpperCase()}`,
            requestId: randomUUID(),
            memberId: profile.id,
            packageId: pack.id,
            packageNameSnapshot: pack.name,
            durationMonthsSnapshot: pack.durationMonths,
            priceSnapshot: pack.price,
            grantsGymAccessSnapshot: true,
            ptSessionsSnapshot: initialPt,
            ptSessionsRemaining: initialPt,
            status: "ACTIVE",
            startsOn: new Date("2026-11-01T00:00:00Z"),
            endsBefore: new Date("2027-06-01T00:00:00Z"),
          },
        });
        await tx.payment.create({
          data: {
            code: `GD08${randomUUID().slice(0, 5).toUpperCase()}`,
            membershipId: m.id,
            amount: pack.price,
            idempotencyKey: randomUUID(),
            status: "CONFIRMED",
            confirmedById: adminUser.id,
            confirmedAt: new Date(),
          },
        });
        return m;
      });

      return { user, profile, membership, token: rawToken };
    }

    function vnDateOffset(daysOffset: number): string {
      return new Date(Date.now() + 7 * 3600_000 + daysOffset * 86400_000)
        .toISOString()
        .slice(0, 10);
    }

    async function createSlotAtVN(vnDateStr: string, hhmm: string) {
      const startTime = new Date(`${vnDateStr}T${hhmm}:00+07:00`);
      const slot = await db.workingSlot.create({
        data: {
          trainerId: trainerProfile.id,
          workDate: new Date(`${vnDateStr}T00:00:00.000Z`),
          startTime,
          endTime: new Date(startTime.getTime() + 3600_000),
          status: "OPEN",
        },
      });
      createdSlotIds.push(slot.id);
      return slot;
    }

    // Helper for < 6h slot within 06:00-22:00 VN time that avoids LHSEED02 (+3..4h)
    async function createUnder6hSlot() {
      const targetMs = Date.now() + 95 * 60_000; // ~1h35m from now
      const vn = new Date(targetMs + 7 * 3600_000);
      const vnDateStr = vn.toISOString().slice(0, 10);
      const h = String(vn.getUTCHours()).padStart(2, "0");
      const m = String(vn.getUTCMinutes()).padStart(2, "0");
      return createSlotAtVN(vnDateStr, `${h}:${m}`);
    }

    async function bookViaApi(token: string, slotId: string) {
      const res = await fetch("http://127.0.0.1:3101/api/appointments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ slotId }),
      });
      const body = await res.json();
      expect(res.status).toBe(201);
      createdAppointmentIds.push(body.appointment.id);
      return body;
    }

    // =========================================================================
    // 1. TC-UC08-001 (Web verification of booked appointment)
    // =========================================================================
    const m001 = await createTestMemberWithPt("TC001", 4);
    const slot001 = await createSlotAtVN(vnDateOffset(1), "14:00");
    const booked001 = await bookViaApi(m001.token, slot001.id);
    const code001 = booked001.appointment.code as string;

    await loginWeb(page, "admin@fithub.vn");
    const row001 = page.locator("tr", { hasText: code001 });
    await expect(row001).toBeVisible();
    await expect(row001).toContainText(m001.profile.memberCode);
    await expect(row001).toContainText("Đã xác nhận");
    await expect(row001).toContainText("Đang giữ");
    mkdirSync(resolve(evidenceRoot, "TC-UC08-001"), { recursive: true });
    await page.screenshot({
      path: resolve(evidenceRoot, "TC-UC08-001/04-web-admin-view.png"),
      fullPage: true,
    });

    // Reload Web page to confirm persistence
    await page.reload();
    await expect(page.locator("tr", { hasText: code001 })).toBeVisible();

    // Also check Trainer view on Web
    const trainerPage = await context.newPage();
    await loginWeb(trainerPage, "trainer@fithub.vn");
    await expect(trainerPage.locator("tr", { hasText: code001 })).toBeVisible();
    await trainerPage.screenshot({
      path: resolve(evidenceRoot, "TC-UC08-001/05-web-trainer-view.png"),
      fullPage: true,
    });

    // =========================================================================
    // 2. TC-UC08-005: PT cancels < 6h before start -> Refund 1 + Compensation +1
    // =========================================================================
    const m005 = await createTestMemberWithPt("TC005", 4);
    const beforeBook005 = (
      await db.membership.findUniqueOrThrow({ where: { id: m005.membership.id } })
    ).ptSessionsRemaining;
    expect(beforeBook005).toBe(4);

    // Slot ~1.5 hours from now (< 6 hours, not yet started, avoids LHSEED02 at +3..4h)
    const slot005 = await createUnder6hSlot();
    const booked005 = await bookViaApi(m005.token, slot005.id);
    const code005 = booked005.appointment.code as string;

    const afterBook005 = (
      await db.membership.findUniqueOrThrow({ where: { id: m005.membership.id } })
    ).ptSessionsRemaining;
    expect(afterBook005).toBe(3);

    await trainerPage.getByRole("button", { name: "Làm mới" }).click();
    const row005 = trainerPage.locator("tr", { hasText: code005 });
    await expect(row005).toBeVisible();
    await row005.getByRole("button", { name: "PT hủy lịch" }).click();

    const dialog005 = trainerPage.getByRole("dialog");
    await expect(dialog005).toBeVisible();
    await expect(dialog005).toContainText(
      "Hủy lịch sát giờ (< 6 tiếng): hội viên sẽ được hoàn lại buổi tập và được cộng đền bù thêm +1 buổi PT.",
    );
    await dialog005
      .getByLabel("Lý do hủy (bắt buộc)")
      .fill("PT có lịch công tác đột xuất dưới 6 giờ");

    mkdirSync(resolve(evidenceRoot, "TC-UC08-005"), { recursive: true });
    await trainerPage.screenshot({
      path: resolve(evidenceRoot, "TC-UC08-005/01-web-cancel-modal-under-6h.png"),
    });

    await dialog005.getByRole("button", { name: "Xác nhận hủy lịch" }).click();
    await expect(trainerPage.getByRole("status")).toContainText(
      `${code005}: Đã hoàn lại 1 buổi PT và cộng đền bù thêm 1 buổi PT cho hội viên.`,
    );
    await expect(row005).toContainText("PT đã hủy");
    await expect(row005).toContainText("Đã đền bù thêm 1 buổi");
    await expect(row005).toContainText("Đã hoàn");

    await trainerPage.screenshot({
      path: resolve(
        evidenceRoot,
        "TC-UC08-005/02-web-after-cancel-compensated.png",
      ),
      fullPage: true,
    });

    const membershipAfter005 = await db.membership.findUniqueOrThrow({
      where: { id: m005.membership.id },
    });
    const apptAfter005 = await db.appointment.findUniqueOrThrow({
      where: { id: booked005.appointment.id },
    });
    const slotAfter005 = await db.workingSlot.findUniqueOrThrow({
      where: { id: slot005.id },
    });

    // 4 before book -> 3 after book -> 5 after PT cancel < 6h (3 + 1 refund + 1 compensation)
    expect(membershipAfter005.ptSessionsRemaining).toBe(5);
    expect(membershipAfter005.ptSessionsSnapshot).toBe(5);
    expect(apptAfter005.status).toBe("CANCELLED_BY_PT");
    expect(apptAfter005.ptSessionState).toBe("REFUNDED");
    expect(apptAfter005.compensationGranted).toBe(true);
    expect(slotAfter005.status).toBe("UNAVAILABLE");

    saveEvidenceJson("TC-UC08-005", "evidence.json", {
      caseId: "TC-UC08-005",
      commit: "3b28ead",
      actor: "trainer@fithub.vn (PT001)",
      memberCode: m005.profile.memberCode,
      appointmentCode: code005,
      slotStartTime: slot005.startTime.toISOString(),
      cancelledAt: apptAfter005.cancelledAt?.toISOString(),
      hoursBeforeStartApprox: 3,
      cancelReason: apptAfter005.cancelReason,
      ptBalance: {
        beforeBook: beforeBook005,
        afterBook: afterBook005,
        afterCancel: membershipAfter005.ptSessionsRemaining,
        snapshotAfterCancel: membershipAfter005.ptSessionsSnapshot,
      },
      appointmentState: {
        status: apptAfter005.status,
        ptSessionState: apptAfter005.ptSessionState,
        compensationGranted: apptAfter005.compensationGranted,
      },
      slotStateAfterCancel: {
        status: slotAfter005.status,
        unavailableReason: slotAfter005.unavailableReason,
      },
    });

    // =========================================================================
    // 3. TC-UC08-007: PT cancels >= 6h before start -> Refund 1 only, no comp
    // =========================================================================
    const m007 = await createTestMemberWithPt("TC007", 4);
    const beforeBook007 = (
      await db.membership.findUniqueOrThrow({ where: { id: m007.membership.id } })
    ).ptSessionsRemaining;
    expect(beforeBook007).toBe(4);

    // Slot tomorrow at 15:30 (>= 6 hours from now, within 06:00-22:00 gym hours)
    const slot007 = await createSlotAtVN(vnDateOffset(1), "15:30");
    const booked007 = await bookViaApi(m007.token, slot007.id);
    const code007 = booked007.appointment.code as string;

    const afterBook007 = (
      await db.membership.findUniqueOrThrow({ where: { id: m007.membership.id } })
    ).ptSessionsRemaining;
    expect(afterBook007).toBe(3);

    await trainerPage.getByRole("button", { name: "Làm mới" }).click();
    const row007 = trainerPage.locator("tr", { hasText: code007 });
    await expect(row007).toBeVisible();
    await row007.getByRole("button", { name: "PT hủy lịch" }).click();

    const dialog007 = trainerPage.getByRole("dialog");
    await expect(dialog007).toBeVisible();
    await expect(dialog007).toContainText(
      "Hội viên sẽ được hoàn lại 1 buổi PT.",
    );
    await dialog007
      .getByLabel("Lý do hủy (bắt buộc)")
      .fill("PT đổi lịch hội thảo chuyên môn trước 8 giờ");

    mkdirSync(resolve(evidenceRoot, "TC-UC08-007"), { recursive: true });
    await trainerPage.screenshot({
      path: resolve(evidenceRoot, "TC-UC08-007/01-web-cancel-modal-over-6h.png"),
    });

    await dialog007.getByRole("button", { name: "Xác nhận hủy lịch" }).click();
    await expect(trainerPage.getByRole("status")).toContainText(
      `${code007}: Đã hoàn lại 1 buổi PT cho hội viên.`,
    );
    await expect(row007).toContainText("PT đã hủy");
    await expect(row007).not.toContainText("Đã đền bù thêm 1 buổi");
    await expect(row007).toContainText("Đã hoàn");

    await trainerPage.screenshot({
      path: resolve(evidenceRoot, "TC-UC08-007/02-web-after-cancel-refunded.png"),
      fullPage: true,
    });

    const membershipAfter007 = await db.membership.findUniqueOrThrow({
      where: { id: m007.membership.id },
    });
    const apptAfter007 = await db.appointment.findUniqueOrThrow({
      where: { id: booked007.appointment.id },
    });
    const slotAfter007 = await db.workingSlot.findUniqueOrThrow({
      where: { id: slot007.id },
    });

    // 4 before book -> 3 after book -> 4 after PT cancel >= 6h (refund 1, no compensation)
    expect(membershipAfter007.ptSessionsRemaining).toBe(4);
    expect(membershipAfter007.ptSessionsSnapshot).toBe(4);
    expect(apptAfter007.status).toBe("CANCELLED_BY_PT");
    expect(apptAfter007.ptSessionState).toBe("REFUNDED");
    expect(apptAfter007.compensationGranted).toBe(false);
    expect(slotAfter007.status).toBe("UNAVAILABLE");

    saveEvidenceJson("TC-UC08-007", "evidence.json", {
      caseId: "TC-UC08-007",
      commit: "3b28ead",
      actor: "trainer@fithub.vn (PT001)",
      memberCode: m007.profile.memberCode,
      appointmentCode: code007,
      slotStartTime: slot007.startTime.toISOString(),
      cancelledAt: apptAfter007.cancelledAt?.toISOString(),
      hoursBeforeStartApprox: 8,
      cancelReason: apptAfter007.cancelReason,
      ptBalance: {
        beforeBook: beforeBook007,
        afterBook: afterBook007,
        afterCancel: membershipAfter007.ptSessionsRemaining,
        snapshotAfterCancel: membershipAfter007.ptSessionsSnapshot,
      },
      appointmentState: {
        status: apptAfter007.status,
        ptSessionState: apptAfter007.ptSessionState,
        compensationGranted: apptAfter007.compensationGranted,
      },
      slotStateAfterCancel: {
        status: slotAfter007.status,
        unavailableReason: slotAfter007.unavailableReason,
      },
    });

    // =========================================================================
    // 4. TC-UC08-009 (Extended): Admin verifies NO_SHOW after slot ended
    // =========================================================================
    const m009 = await createTestMemberWithPt("TC009", 2);
    const vnPastDate = vnDateOffset(-1);
    const pastStart = new Date(`${vnPastDate}T14:00:00+07:00`);
    const pastEnd = new Date(pastStart.getTime() + 3600_000);
    const slot009 = await db.workingSlot.create({
      data: {
        trainerId: trainerProfile.id,
        workDate: new Date(`${vnPastDate}T00:00:00.000Z`),
        startTime: pastStart,
        endTime: pastEnd,
        status: "BOOKED",
        memberId: m009.profile.id,
      },
    });
    createdSlotIds.push(slot009.id);

    const code009 = `LH99${randomUUID().slice(0, 4).toUpperCase()}`;
    const appt009 = await db.appointment.create({
      data: {
        code: code009,
        memberId: m009.profile.id,
        trainerId: trainerProfile.id,
        slotId: slot009.id,
        membershipId: m009.membership.id,
        status: "CONFIRMED",
        ptSessionState: "HELD",
      },
    });
    createdAppointmentIds.push(appt009.id);
    await db.membership.update({
      where: { id: m009.membership.id },
      data: { ptSessionsRemaining: 1 },
    });

    // Trainer does NOT see "Xác minh vắng mặt (NO_SHOW)" button
    await trainerPage.getByRole("button", { name: "Làm mới" }).click();
    const trainerRow009 = trainerPage.locator("tr", { hasText: code009 });
    await expect(trainerRow009).toBeVisible();
    await expect(
      trainerRow009.getByRole("button", { name: /NO_SHOW/ }),
    ).toHaveCount(0);

    // Admin sees and clicks "Xác minh vắng mặt (NO_SHOW)"
    await page.getByRole("button", { name: "Làm mới" }).click();
    const adminRow009 = page.locator("tr", { hasText: code009 });
    await expect(adminRow009).toBeVisible();
    await adminRow009
      .getByRole("button", { name: "Xác minh vắng mặt (NO_SHOW)" })
      .click();

    await expect(page.getByRole("status")).toContainText(
      `${code009}: Đã trừ 1 buổi PT của hội viên.`,
    );
    await expect(adminRow009).toContainText("Vắng mặt");
    await expect(adminRow009).toContainText("Đã trừ");

    mkdirSync(resolve(evidenceRoot, "TC-UC08-009"), { recursive: true });
    await page.screenshot({
      path: resolve(evidenceRoot, "TC-UC08-009/01-web-admin-no-show-verified.png"),
      fullPage: true,
    });

    const apptAfter009 = await db.appointment.findUniqueOrThrow({
      where: { id: appt009.id },
    });
    const membershipAfter009 = await db.membership.findUniqueOrThrow({
      where: { id: m009.membership.id },
    });
    expect(apptAfter009.status).toBe("NO_SHOW");
    expect(apptAfter009.ptSessionState).toBe("CONSUMED");
    expect(membershipAfter009.ptSessionsRemaining).toBe(1);

    saveEvidenceJson("TC-UC08-009", "evidence.json", {
      caseId: "TC-UC08-009",
      commit: "3b28ead",
      actor: "admin@fithub.vn",
      appointmentCode: code009,
      beforeBook: 2,
      afterBook: 1,
      afterNoShow: membershipAfter009.ptSessionsRemaining,
      status: apptAfter009.status,
      ptSessionState: apptAfter009.ptSessionState,
      verifiedById: apptAfter009.verifiedById,
    });

    await trainerPage.close();
  } finally {
    if (createdAppointmentIds.length) {
      await db.reminder.deleteMany({
        where: { sourceId: { in: createdAppointmentIds } },
      });
      await db.appointment.deleteMany({
        where: { id: { in: createdAppointmentIds } },
      });
    }
    if (createdSlotIds.length) {
      await db.workingSlot.deleteMany({
        where: { id: { in: createdSlotIds } },
      });
    }
    if (createdUserIds.length) {
      await db.notification.deleteMany({
        where: { recipientId: { in: createdUserIds } },
      });
      await db.session.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      const profiles = await db.memberProfile.findMany({
        where: { userId: { in: createdUserIds } },
        select: { id: true },
      });
      const profileIds = profiles.map((p) => p.id);
      if (profileIds.length) {
        const memberships = await db.membership.findMany({
          where: { memberId: { in: profileIds } },
          select: { id: true },
        });
        const mIds = memberships.map((m) => m.id);
        if (mIds.length) {
          await db.$executeRawUnsafe(
            `DELETE FROM "Payment" WHERE "membershipId" = ANY($1::uuid[])`,
            mIds,
          ).catch(() => {});
          await db.membership.deleteMany({ where: { id: { in: mIds } } }).catch(() => {});
        }
        await db.memberProfile.deleteMany({ where: { id: { in: profileIds } } }).catch(() => {});
      }
      await db.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => {});
    }
    await db.$disconnect();
  }
});
