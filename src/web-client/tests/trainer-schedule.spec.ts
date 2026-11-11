import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import type { RegisterAvailabilityResponse } from "@fithub/contracts";

async function login(page: Page, email: string) {
  await page.goto("/#/login");
  await page.getByLabel("Email hoặc số điện thoại").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("FitHubDemo!2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.getByRole("link", { name: "Lịch làm việc PT" }).click();
}

test("UC07: preview, register, protect and change weekly slots, admin reads schedule and free slots", async ({
  page,
  context,
}) => {
  test.slow();
  const db = new PrismaClient();
  const ids: string[] = [];
  try {
    const last = await db.workingSlot.findFirst({
      where: { trainer: { trainerCode: "PT001" } },
      orderBy: { workDate: "desc" },
      select: { workDate: true },
    });
    const day = new Date(
      Math.max(Date.now(), last?.workDate.getTime() || 0) + 14 * 86400000,
    )
      .toISOString()
      .slice(0, 10);
    await login(page, "trainer@fithub.vn");
    await page.getByLabel("Ngày đăng ký").fill(day);
    await page.getByLabel("Đến giờ").fill("08:45");
    await expect(page.getByRole("alert")).toContainText("tối thiểu 60 phút");
    await expect(
      page.getByRole("button", { name: "Lưu lịch làm việc" }),
    ).toBeDisabled();
    await page.getByLabel("Đến giờ").fill("12:00");
    const preview = page.getByRole("region", { name: "Xem trước các ca" });
    await expect(preview.getByRole("listitem")).toHaveText([
      "08:00–09:00",
      "09:15–10:15",
      "10:30–11:30",
    ]);
    await expect(preview).toContainText("30 phút dư");
    const create = page.waitForResponse(
      (r) =>
        r.url().endsWith("/me/availability") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Lưu lịch làm việc" }).click();
    const result = await create;
    expect(result.ok()).toBe(true);
    const created: RegisterAvailabilityResponse = await result.json();
    ids.push(...created.slots.map((s) => s.id));
    const grid = page.getByRole("region", { name: "Lịch tuần" });
    const row = grid.getByRole("row").filter({ hasText: "08:00–09:00" });
    await expect(grid.getByText("Trống", { exact: true })).toHaveCount(3);
    await page.getByLabel("Từ giờ").fill("08:30");
    await page.getByLabel("Đến giờ").fill("10:00");
    const conflict = page.waitForResponse((r) =>
      r.url().endsWith("/me/availability"),
    );
    await page.getByRole("button", { name: "Lưu lịch làm việc" }).click();
    expect((await conflict).status()).toBe(409);
    await expect(page.getByRole("alert")).toContainText("trùng");

    await row.getByRole("button", { name: "Báo bận" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Lý do báo bận").fill("Bận họp chuyên môn");
    await dialog.getByRole("button", { name: "Xác nhận" }).click();
    await expect(row).toContainText("Đã báo bận");
    await page.reload();
    await expect(row).toContainText("Bận họp chuyên môn");

    const member = await db.memberProfile.findUniqueOrThrow({
      where: { memberCode: "HV002" },
    });
    await db.workingSlot.update({
      where: { id: ids[1] },
      data: { status: "BOOKED", memberId: member.id },
    });
    const admin = await context.newPage();
    await login(admin, "admin@fithub.vn");
    await admin
      .getByLabel("Huấn luyện viên", { exact: true })
      .selectOption(created.slots[0].trainerId);
    await admin.getByLabel("Đi tới ngày").fill(day);
    const adminGrid = admin.getByRole("region", { name: "Lịch tuần" });
    await expect(adminGrid).toContainText("Bận họp chuyên môn");
    await expect(adminGrid).toContainText("HV002");
    await expect(
      adminGrid.getByRole("button", { name: /Báo bận|Xóa ca|Mở lại ca/ }),
    ).toHaveCount(0);
    await expect(
      admin.getByRole("button", { name: "Lưu lịch làm việc" }),
    ).toHaveCount(0);
    await admin
      .getByRole("link", { name: "Huấn luyện viên", exact: true })
      .click();
    await admin
      .getByRole("row")
      .filter({ hasText: "PT001" })
      .getByRole("link")
      .click();
    await admin.getByLabel("Tra cứu ca trống theo ngày").fill(day);
    await expect(admin.getByRole("listitem")).toHaveText(["10:30–11:30"]);

    await page.getByRole("button", { name: "Tuần sau" }).click();
    await expect(row).toHaveCount(0);
    await page.getByRole("button", { name: "Tuần trước" }).click();
    const booked = grid.getByRole("row").filter({ hasText: "09:15–10:15" });
    await expect(booked).toContainText("Hủy lịch hẹn theo quy định");
    await expect(booked.getByRole("button")).toHaveCount(0);
    await row.getByRole("button", { name: "Mở lại ca" }).click();
    await dialog.getByRole("button", { name: "Xác nhận" }).click();
    await expect(row).toContainText("Trống");
    await row.getByRole("button", { name: "Xóa ca" }).click();
    await dialog.getByRole("button", { name: "Hủy", exact: true }).click();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Xóa ca" }).click();
    await dialog.getByRole("button", { name: "Xác nhận" }).click();
    await expect(row).toHaveCount(0);

    // Move only the browser clock to the last 23 hours before the remaining open slot.
    await page.clock.setFixedTime(
      new Date(Date.parse(created.slots[2].startTime) - 23 * 3600000),
    );
    await page.reload();
    const late = grid.getByRole("row").filter({ hasText: "10:30–11:30" });
    await expect(late).toContainText("tối thiểu 24 giờ");
    await expect(late.getByRole("button")).toHaveCount(0);
  } finally {
    if (ids.length)
      await db.workingSlot.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
});
