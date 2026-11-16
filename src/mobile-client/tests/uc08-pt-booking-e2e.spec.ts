import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID, createHash } from "node:crypto";
import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { hashPassword } from "../../backend/src/modules/auth/password";

const evidenceRoot = resolve(process.cwd(), "../../evidence/UC08");
const API_URL = "http://127.0.0.1:3102";

function saveEvidenceJson(caseId: string, fileName: string, payload: unknown) {
  const dir = resolve(evidenceRoot, caseId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, fileName), JSON.stringify(payload, null, 2), "utf8");
}

async function loginMobile(page: Page, email: string) {
  await page.goto("/");
  await page
    .getByLabel("Email hoặc số điện thoại", { exact: true })
    .fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("FitHubDemo!2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.getByRole("button", { name: "Tìm huấn luyện viên" }).click();
}

test("UC08 Mobile & API E2E: TC-UC08-001, TC-UC08-002, TC-UC08-003, TC-UC08-004, TC-UC08-006 & TC-UC08-008", async ({
  page,
  context,
}) => {
  test.slow();
  const db = new PrismaClient();
  const createdUserIds: string[] = [];
  const createdTrainerIds: string[] = [];
  const createdSlotIds: string[] = [];
  const createdAppointmentIds: string[] = [];

  try {
    const adminUser = await db.user.findUniqueOrThrow({
      where: { email: "admin@fithub.vn" },
    });
    const pack = await db.package.findUniqueOrThrow({
      where: { code: "GYM06" },
    });

    // Dedicated test trainer so mobile slot selection is deterministic and isolated
    const ptTag = randomUUID().slice(0, 6).toUpperCase();
    const ptUser = await db.user.create({
      data: {
        email: `pt.uc08.${ptTag.toLowerCase()}@fithub.vn`,
        displayName: `HLV Kiểm Thử ${ptTag}`,
        passwordHash: await hashPassword("FitHubDemo!2026"),
        role: "TRAINER",
        status: "ACTIVE",
        verifiedAt: new Date(),
      },
    });
    createdUserIds.push(ptUser.id);
    const ptToken = randomUUID() + randomUUID();
    await db.session.create({
      data: {
        userId: ptUser.id,
        tokenHash: createHash("sha256").update(ptToken).digest("hex"),
        deviceId: randomUUID(),
        requestId: randomUUID(),
        platform: "WEB",
        expiresAt: new Date(Date.now() + 86400_000),
      },
    });
    const trainer = await db.trainerProfile.upsert({
      where: { userId: ptUser.id },
      update: {
        bio: "Huấn luyện viên chuyên kiểm thử chéo UC08.",
        specialties: ["Tăng cơ", "Phục hồi"],
        experienceYears: 5,
        workStatus: "ACTIVE",
      },
      create: {
        userId: ptUser.id,
        trainerCode: `PT08${ptTag.slice(0, 4)}`,
        bio: "Huấn luyện viên chuyên kiểm thử chéo UC08.",
        specialties: ["Tăng cơ", "Phục hồi"],
        experienceYears: 5,
        workStatus: "ACTIVE",
      },
    });
    createdTrainerIds.push(trainer.id);

    async function createMemberWithPt(label: string, initialPt: number) {
      const email = `uc08.mob.${label.toLowerCase()}.${randomUUID().slice(0, 6)}@example.com`;
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

      return { user, profile, membership, email, token: rawToken };
    }

    // Helper: create a slot on tomorrow VN date at a specific HH:mm (+07:00)
    const tomorrowVN = new Date(Date.now() + 7 * 3600_000 + 24 * 3600_000)
      .toISOString()
      .slice(0, 10);

    async function createSlotOnDate(vnDate: string, hhmm: string) {
      const startTime = new Date(`${vnDate}T${hhmm}:00+07:00`);
      const slot = await db.workingSlot.create({
        data: {
          trainerId: trainer.id,
          workDate: new Date(`${vnDate}T00:00:00.000Z`),
          startTime,
          endTime: new Date(startTime.getTime() + 3600_000),
          status: "OPEN",
        },
      });
      createdSlotIds.push(slot.id);
      return slot;
    }

    // =========================================================================
    // 1. TC-UC08-001: Member with N=4 books an OPEN slot on Mobile UI
    // =========================================================================
    const m001 = await createMemberWithPt("TC001", 4);
    const slot001 = await createSlotOnDate(tomorrowVN, "15:00");
    const beforeBook001 = (
      await db.membership.findUniqueOrThrow({ where: { id: m001.membership.id } })
    ).ptSessionsRemaining;
    expect(beforeBook001).toBe(4);

    await loginMobile(page, m001.email);
    await expect(
      page.getByText("4 buổi PT còn lại", { exact: true }),
    ).toBeVisible();

    await page.getByLabel("Tên huấn luyện viên").fill(ptTag);
    const ptCardBtn = page.getByRole("button", {
      name: `Xem hồ sơ & đặt lịch · ${ptUser.displayName}`,
      exact: true,
    });
    await expect(ptCardBtn).toBeVisible();

    mkdirSync(resolve(evidenceRoot, "TC-UC08-001"), { recursive: true });
    await page.screenshot({
      path: resolve(evidenceRoot, "TC-UC08-001/01-mobile-before-book.png"),
      fullPage: true,
    });

    await ptCardBtn.click();
    await expect(
      page.getByRole("heading", { name: "Hồ sơ chuyên môn", exact: true }),
    ).toBeVisible();
    await page.waitForTimeout(450);
    const dayChipText = tomorrowVN.split("-").reverse().join("/").slice(0, 5);
    await page.getByRole("button").filter({ hasText: dayChipText }).last().click();

    const slotChip001 = page.getByRole("button", {
      name: "15:00 – 16:00",
      exact: true,
    });
    await expect(slotChip001).toBeVisible();
    await slotChip001.click();

    await expect(
      page.getByRole("heading", { name: "Xác nhận đặt lịch", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Còn 4 buổi · Giữ 1 buổi khi đặt"),
    ).toBeVisible();
    await page.waitForTimeout(300);

    await page.screenshot({
      path: resolve(evidenceRoot, "TC-UC08-001/02-mobile-confirm-modal.png"),
    });

    await page
      .getByRole("button", { name: "Xác nhận đặt lịch", exact: true })
      .click();
    await expect(page.getByText(/Đặt lịch thành công/)).toBeVisible();

    await page.getByRole("button", { name: "Đóng hồ sơ", exact: true }).click();
    await expect(
      page.getByText("3 buổi PT còn lại", { exact: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Xem tất cả", exact: true }).click();
    const appt001 = await db.appointment.findFirstOrThrow({
      where: { slotId: slot001.id },
    });
    createdAppointmentIds.push(appt001.id);
    await expect(
      page.getByText(`${appt001.code} · Đã xác nhận`),
    ).toBeVisible();

    await page.screenshot({
      path: resolve(evidenceRoot, "TC-UC08-001/03-mobile-after-book.png"),
      fullPage: true,
    });

    const afterBook001 = (
      await db.membership.findUniqueOrThrow({ where: { id: m001.membership.id } })
    ).ptSessionsRemaining;
    const slotAfter001 = await db.workingSlot.findUniqueOrThrow({
      where: { id: slot001.id },
    });
    expect(afterBook001).toBe(3);
    expect(slotAfter001.status).toBe("BOOKED");
    expect(appt001.status).toBe("CONFIRMED");
    expect(appt001.ptSessionState).toBe("HELD");

    saveEvidenceJson("TC-UC08-001", "evidence.json", {
      caseId: "TC-UC08-001",
      commit: "3b28ead",
      memberCode: m001.profile.memberCode,
      trainerCode: trainer.trainerCode,
      appointmentCode: appt001.code,
      workDate: tomorrowVN,
      slotTimeVN: "15:00 - 16:00",
      ptBalance: {
        beforeBook: beforeBook001,
        afterBook: afterBook001,
      },
      appointmentState: {
        status: appt001.status,
        ptSessionState: appt001.ptSessionState,
      },
      slotState: {
        beforeBook: "OPEN",
        afterBook: slotAfter001.status,
      },
    });

    // =========================================================================
    // 2. TC-UC08-004: Member cancels appointment >= 12h before start -> REFUND
    // =========================================================================
    // appt001 is on tomorrow 15:00 (> 24h from now, so >= 12h)
    await page.getByRole("button", { name: "Hủy lịch", exact: true }).click();
    await expect(
      page.getByText(`Hủy lịch hẹn ${appt001.code}?`),
    ).toBeVisible();
    await expect(
      page.getByText("Còn ít nhất 12 giờ: bạn được hoàn lại 1 buổi PT."),
    ).toBeVisible();
    await page.waitForTimeout(300);

    mkdirSync(resolve(evidenceRoot, "TC-UC08-004"), { recursive: true });
    await page.screenshot({
      path: resolve(
        evidenceRoot,
        "TC-UC08-004/01-mobile-cancel-modal-over-12h.png",
      ),
    });

    await page
      .getByRole("button", { name: "Xác nhận hủy", exact: true })
      .click();
    await expect(
      page.getByText(
        `Đã hủy ${appt001.code}. Hoàn 1 buổi PT, còn 4.`,
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByText("4 buổi PT còn lại", { exact: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Đã hủy", exact: true }).click();
    await expect(
      page.getByText(`${appt001.code} · Bạn đã hủy`),
    ).toBeVisible();

    await page.screenshot({
      path: resolve(
        evidenceRoot,
        "TC-UC08-004/02-mobile-after-cancel-refunded.png",
      ),
      fullPage: true,
    });

    const afterCancel004 = (
      await db.membership.findUniqueOrThrow({ where: { id: m001.membership.id } })
    ).ptSessionsRemaining;
    const apptAfter004 = await db.appointment.findUniqueOrThrow({
      where: { id: appt001.id },
    });
    const slotAfter004 = await db.workingSlot.findUniqueOrThrow({
      where: { id: slot001.id },
    });
    expect(afterCancel004).toBe(4);
    expect(apptAfter004.status).toBe("CANCELLED_BY_MEMBER");
    expect(apptAfter004.ptSessionState).toBe("REFUNDED");
    expect(slotAfter004.status).toBe("OPEN");

    saveEvidenceJson("TC-UC08-004", "evidence.json", {
      caseId: "TC-UC08-004",
      commit: "3b28ead",
      memberCode: m001.profile.memberCode,
      appointmentCode: appt001.code,
      slotStartTime: slot001.startTime.toISOString(),
      cancelledAt: apptAfter004.cancelledAt?.toISOString(),
      hoursBeforeStartApprox:
        Math.round(
          ((slot001.startTime.getTime() - Date.now()) / 3600_000) * 10,
        ) / 10,
      ptBalance: {
        beforeBook: beforeBook001,
        afterBook: afterBook001,
        afterCancel: afterCancel004,
      },
      appointmentState: {
        status: apptAfter004.status,
        ptSessionState: apptAfter004.ptSessionState,
      },
      slotStateAfterCancel: slotAfter004.status,
    });

    // =========================================================================
    // 3. TC-UC08-002: Member with N=0 PT sessions rejected (400)
    // =========================================================================
    const m002 = await createMemberWithPt("TC002", 0);
    const slot002 = await createSlotOnDate(tomorrowVN, "16:30");

    // First verify direct POST /api/appointments returns 400 INSUFFICIENT_PT_SESSIONS
    // (before UI login rotates the single active mobile session token)
    const directRes002 = await fetch(`${API_URL}/api/appointments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${m002.token}`,
      },
      body: JSON.stringify({ slotId: slot002.id }),
    });
    const directBody002 = await directRes002.json();
    expect(directRes002.status).toBe(400);
    expect(directBody002.code).toBe("INSUFFICIENT_PT_SESSIONS");

    const page002 = await context.newPage();
    await loginMobile(page002, m002.email);
    await expect(
      page002.getByText("0 buổi PT còn lại", { exact: true }),
    ).toBeVisible();

    await page002.getByLabel("Tên huấn luyện viên").fill(ptTag);
    await page002
      .getByRole("button", {
        name: `Xem hồ sơ & đặt lịch · ${ptUser.displayName}`,
        exact: true,
      })
      .click();
    await expect(
      page002.getByRole("heading", { name: "Hồ sơ chuyên môn", exact: true }),
    ).toBeVisible();
    await page002.waitForTimeout(450);
    await page002
      .getByRole("button")
      .filter({ hasText: dayChipText })
      .last()
      .click();
    await page002
      .getByRole("button", { name: "16:30 – 17:30", exact: true })
      .click();

    await expect(
      page002.getByRole("heading", { name: "Xác nhận đặt lịch", exact: true }),
    ).toBeVisible();
    await expect(
      page002.getByText("Bạn không có gói còn buổi PT hợp lệ cho ngày tập này."),
    ).toBeVisible();
    await expect(
      page002.getByRole("button", { name: "Xác nhận đặt lịch", exact: true }),
    ).toBeDisabled();
    await page002.waitForTimeout(300);

    mkdirSync(resolve(evidenceRoot, "TC-UC08-002"), { recursive: true });
    await page002.screenshot({
      path: resolve(evidenceRoot, "TC-UC08-002/01-mobile-zero-pt-rejected.png"),
    });

    const afterAttempt002 = (
      await db.membership.findUniqueOrThrow({ where: { id: m002.membership.id } })
    ).ptSessionsRemaining;
    const slotAfter002 = await db.workingSlot.findUniqueOrThrow({
      where: { id: slot002.id },
    });
    const apptCount002 = await db.appointment.count({
      where: { slotId: slot002.id },
    });
    expect(afterAttempt002).toBe(0);
    expect(slotAfter002.status).toBe("OPEN");
    expect(apptCount002).toBe(0);

    saveEvidenceJson("TC-UC08-002", "evidence.json", {
      caseId: "TC-UC08-002",
      commit: "3b28ead",
      memberCode: m002.profile.memberCode,
      slotId: slot002.id,
      ptBalanceBefore: 0,
      ptBalanceAfter: afterAttempt002,
      apiStatus: directRes002.status,
      apiError: directBody002,
      slotStatusBefore: "OPEN",
      slotStatusAfter: slotAfter002.status,
      appointmentsCreatedOnSlot: apptCount002,
    });
    await page002.close();

    // =========================================================================
    // 4. TC-UC08-003: Two members concurrently book the exact same OPEN slot
    // =========================================================================
    const m003A = await createMemberWithPt("TC003A", 3);
    const m003B = await createMemberWithPt("TC003B", 3);
    const slot003 = await createSlotOnDate(tomorrowVN, "18:00");

    const [resA, resB] = await Promise.all([
      fetch(`${API_URL}/api/appointments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${m003A.token}`,
        },
        body: JSON.stringify({ slotId: slot003.id }),
      }).then(async (r) => ({
        member: m003A.profile.memberCode,
        status: r.status,
        body: await r.json(),
      })),
      fetch(`${API_URL}/api/appointments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${m003B.token}`,
        },
        body: JSON.stringify({ slotId: slot003.id }),
      }).then(async (r) => ({
        member: m003B.profile.memberCode,
        status: r.status,
        body: await r.json(),
      })),
    ]);

    const statuses003 = [resA.status, resB.status].sort((a, b) => a - b);
    expect(statuses003).toEqual([201, 409]);

    const winner003 = resA.status === 201 ? resA : resB;
    const loser003 = resA.status === 409 ? resA : resB;
    createdAppointmentIds.push(winner003.body.appointment.id);
    expect(loser003.body.code).toBe("SLOT_ALREADY_BOOKED");

    const balA003 = (
      await db.membership.findUniqueOrThrow({ where: { id: m003A.membership.id } })
    ).ptSessionsRemaining;
    const balB003 = (
      await db.membership.findUniqueOrThrow({ where: { id: m003B.membership.id } })
    ).ptSessionsRemaining;
    const apptsOnSlot003 = await db.appointment.findMany({
      where: { slotId: slot003.id },
    });
    expect(apptsOnSlot003.length).toBe(1);
    expect([balA003, balB003].sort((a, b) => a - b)).toEqual([2, 3]);

    saveEvidenceJson("TC-UC08-003", "evidence.json", {
      caseId: "TC-UC08-003",
      commit: "3b28ead",
      slotId: slot003.id,
      concurrentResponses: [resA, resB],
      memberABalance: {
        memberCode: m003A.profile.memberCode,
        beforeBook: 3,
        afterBook: balA003,
      },
      memberBBalance: {
        memberCode: m003B.profile.memberCode,
        beforeBook: 3,
        afterBook: balB003,
      },
      persistedAppointmentsCount: apptsOnSlot003.length,
      persistedAppointmentCode: apptsOnSlot003[0]!.code,
    });

    // =========================================================================
    // 5. TC-UC08-006: Member cancels < 12h before start -> CONSUMED (loses 1)
    // =========================================================================
    const m006 = await createMemberWithPt("TC006", 4);
    const start006 = new Date(Date.now() + 4 * 3600_000); // 4 hours from now (< 12h)
    start006.setUTCMinutes(0, 0, 0);
    const vnDate006 = new Date(start006.getTime() + 7 * 3600_000)
      .toISOString()
      .slice(0, 10);
    const slot006 = await db.workingSlot.create({
      data: {
        trainerId: trainer.id,
        workDate: new Date(`${vnDate006}T00:00:00.000Z`),
        startTime: start006,
        endTime: new Date(start006.getTime() + 3600_000),
        status: "OPEN",
      },
    });
    createdSlotIds.push(slot006.id);

    const beforeBook006 = (
      await db.membership.findUniqueOrThrow({ where: { id: m006.membership.id } })
    ).ptSessionsRemaining;
    expect(beforeBook006).toBe(4);

    const bookRes006 = await fetch(`${API_URL}/api/appointments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${m006.token}`,
      },
      body: JSON.stringify({ slotId: slot006.id }),
    });
    const bookBody006 = await bookRes006.json();
    expect(bookRes006.status).toBe(201);
    const code006 = bookBody006.appointment.code as string;
    const apptId006 = bookBody006.appointment.id as string;
    createdAppointmentIds.push(apptId006);

    const afterBook006 = (
      await db.membership.findUniqueOrThrow({ where: { id: m006.membership.id } })
    ).ptSessionsRemaining;
    expect(afterBook006).toBe(3);

    const page006 = await context.newPage();
    await loginMobile(page006, m006.email);
    await expect(
      page006.getByText("3 buổi PT còn lại", { exact: true }),
    ).toBeVisible();
    await page006.getByRole("button", { name: "Xem tất cả", exact: true }).click();
    await expect(
      page006.getByText(`${code006} · Đã xác nhận`),
    ).toBeVisible();

    await page006.getByRole("button", { name: "Hủy lịch", exact: true }).click();
    await expect(
      page006.getByText(`Hủy lịch hẹn ${code006}?`),
    ).toBeVisible();
    await expect(
      page006.getByText("Còn dưới 12 giờ: bạn mất 1 buổi PT nếu xác nhận hủy."),
    ).toBeVisible();
    await page006.waitForTimeout(300);

    mkdirSync(resolve(evidenceRoot, "TC-UC08-006"), { recursive: true });
    await page006.screenshot({
      path: resolve(
        evidenceRoot,
        "TC-UC08-006/01-mobile-cancel-modal-under-12h.png",
      ),
    });

    await page006
      .getByRole("button", { name: "Xác nhận hủy", exact: true })
      .click();
    await expect(
      page006.getByText(
        `Đã hủy ${code006}. Hủy sát giờ nên mất 1 buổi PT, còn 3.`,
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page006.getByText("3 buổi PT còn lại", { exact: true }),
    ).toBeVisible();

    await page006.getByRole("button", { name: "Đã hủy", exact: true }).click();
    await expect(
      page006.getByText(`${code006} · Bạn đã hủy`),
    ).toBeVisible();

    await page006.screenshot({
      path: resolve(
        evidenceRoot,
        "TC-UC08-006/02-mobile-after-cancel-consumed.png",
      ),
      fullPage: true,
    });

    const afterCancel006 = (
      await db.membership.findUniqueOrThrow({ where: { id: m006.membership.id } })
    ).ptSessionsRemaining;
    const apptAfter006 = await db.appointment.findUniqueOrThrow({
      where: { id: apptId006 },
    });
    const slotAfter006 = await db.workingSlot.findUniqueOrThrow({
      where: { id: slot006.id },
    });

    // 4 before book -> 3 after book -> 3 after late cancel (<12h: session stays consumed, not deducted twice)
    expect(afterCancel006).toBe(3);
    expect(apptAfter006.status).toBe("CANCELLED_BY_MEMBER");
    expect(apptAfter006.ptSessionState).toBe("CONSUMED");
    expect(slotAfter006.status).toBe("OPEN");

    saveEvidenceJson("TC-UC08-006", "evidence.json", {
      caseId: "TC-UC08-006",
      commit: "3b28ead",
      memberCode: m006.profile.memberCode,
      appointmentCode: code006,
      slotStartTime: slot006.startTime.toISOString(),
      cancelledAt: apptAfter006.cancelledAt?.toISOString(),
      hoursBeforeStartApprox:
        Math.round(
          ((slot006.startTime.getTime() - Date.now()) / 3600_000) * 10,
        ) / 10,
      ptBalance: {
        beforeBook: beforeBook006,
        afterBook: afterBook006,
        afterCancel: afterCancel006,
      },
      appointmentState: {
        status: apptAfter006.status,
        ptSessionState: apptAfter006.ptSessionState,
      },
      slotStateAfterCancel: slotAfter006.status,
    });

    // =========================================================================
    // 6. TC-UC08-008 (Extended): Duplicate cancel replay & unauthorized cancel
    // =========================================================================
    // Replay cancel on already cancelled appointment apptId006
    const freshToken006 = randomUUID() + randomUUID();
    await db.session.create({
      data: {
        userId: m006.user.id,
        tokenHash: createHash("sha256").update(freshToken006).digest("hex"),
        deviceId: randomUUID(),
        requestId: randomUUID(),
        platform: "MOBILE",
        expiresAt: new Date(Date.now() + 86400_000),
      },
    });
    const replayMemberCancel = await fetch(
      `${API_URL}/api/appointments/${apptId006}/cancel-by-member`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${freshToken006}` },
      },
    );
    const replayMemberBody = await replayMemberCancel.json();
    expect(replayMemberCancel.status).toBe(409);
    expect(replayMemberBody.code).toBe("APPOINTMENT_NOT_CONFIRMED");

    // Verify PT balance unchanged after replay
    const afterReplay006 = (
      await db.membership.findUniqueOrThrow({ where: { id: m006.membership.id } })
    ).ptSessionsRemaining;
    expect(afterReplay006).toBe(3);

    saveEvidenceJson("TC-UC08-008", "evidence.json", {
      caseId: "TC-UC08-008",
      commit: "3b28ead",
      scenario: "Duplicate cancel replay & idempotency protection",
      appointmentCode: code006,
      replayResponseStatus: replayMemberCancel.status,
      replayResponseBody: replayMemberBody,
      ptBalanceBeforeReplay: 3,
      ptBalanceAfterReplay: afterReplay006,
    });

    await page006.close();
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
    if (createdTrainerIds.length) {
      await db.trainerProfile
        .deleteMany({ where: { id: { in: createdTrainerIds } } })
        .catch(() => {});
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
          await db
            .$executeRawUnsafe(
              `DELETE FROM "Payment" WHERE "membershipId" = ANY($1::uuid[])`,
              mIds,
            )
            .catch(() => {});
          await db.membership
            .deleteMany({ where: { id: { in: mIds } } })
            .catch(() => {});
        }
        await db.memberProfile
          .deleteMany({ where: { id: { in: profileIds } } })
          .catch(() => {});
      }
      await db.user
        .deleteMany({ where: { id: { in: createdUserIds } } })
        .catch(() => {});
    }
    await db.$disconnect();
  }
});
