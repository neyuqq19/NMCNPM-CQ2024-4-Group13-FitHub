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

const formatDay = (day: string) => day.split("-").reverse().join("/");

test("UC07: register, modify, protect and inspect slots on desktop and mobile", async ({
  page,
  context,
}) => {
  test.slow();
  const db = new PrismaClient();
  const ids: string[] = [];
  const button = (name: string | RegExp) => page.getByRole("button", { name });
  const grid = page.getByRole("region", { name: "Lịch tuần" });
  const dialog = page.getByRole("dialog");
  const register = button("+ Đăng ký giờ rảnh");
  const save = button("Lưu lịch làm việc");
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
    await page.getByLabel("Đi tới ngày").fill(formatDay(day));
    await register.click();
    await expect(dialog.getByLabel("Ngày đăng ký")).toHaveValue(formatDay(day));
    await dialog.getByLabel("Đến giờ").fill("08:45");
    await expect(dialog.getByRole("alert")).toContainText("tối thiểu 60 phút");
    await expect(save).toBeDisabled();
    await dialog.getByLabel("Đến giờ").fill("12:00");
    const preview = dialog.getByRole("region", { name: "Xem trước các ca" });
    await expect(preview).toContainText("3 ca");
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
    await save.click();
    const result = await create;
    expect(result.ok()).toBe(true);
    const created: RegisterAvailabilityResponse = await result.json();
    ids.push(...created.slots.map((s) => s.id));
    await expect(dialog).toHaveCount(0);
    const first = grid.getByRole("button", { name: /08:00–09:00/ });
    const second = grid.getByRole("button", { name: /09:15–10:15/ });
    const third = grid.getByRole("button", { name: /10:30–11:30/ });
    await expect(grid.getByRole("button", { name: /Còn trống/ })).toHaveCount(
      3,
    );
    const firstBox = await first.boundingBox(),
      secondBox = await second.boundingBox();
    expect(firstBox!.y + firstBox!.height).toBeLessThan(secondBox!.y);
    await register.click();
    await dialog.getByLabel("Từ giờ").fill("08:30");
    await dialog.getByLabel("Đến giờ").fill("10:00");
    const conflict = page.waitForResponse((r) =>
      r.url().endsWith("/me/availability"),
    );
    await save.click();
    expect((await conflict).status()).toBe(409);
    await expect(dialog.getByRole("alert")).toContainText("trùng");
    await dialog.getByRole("button", { name: "Đóng" }).click();

    await first.click();
    await button("Báo bận").click();
    await expect(button("Xác nhận")).toBeDisabled();
    await dialog.getByLabel("Lý do báo bận").fill("Bận họp chuyên môn");
    await button("Xác nhận").click();
    await expect(first).toContainText("Bận họp chuyên môn");
    await page.reload();
    await expect(first).toContainText("Bận họp chuyên môn");

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
    await admin.getByLabel("Đi tới ngày").fill(formatDay(day));
    const adminGrid = admin.getByRole("region", { name: "Lịch tuần" });
    await expect(adminGrid).toContainText("Bận họp chuyên môn");
    await expect(adminGrid).toContainText("HV002");
    await adminGrid.getByRole("button", { name: /10:30–11:30/ }).click();
    await expect(admin.getByRole("dialog").getByRole("button")).toHaveCount(1);
    await admin.getByRole("button", { name: "Đóng" }).click();
    await expect(
      admin.getByRole("button", { name: "+ Đăng ký giờ rảnh" }),
    ).toHaveCount(0);
    await admin.goto("/#/trainers/" + created.slots[0].trainerId);
    await admin.getByLabel("Tra cứu ca trống theo ngày").fill(formatDay(day));
    await expect(admin.getByText("10:30–11:30", { exact: true })).toBeVisible();
    await expect(admin.getByText("08:00–09:00", { exact: true })).toHaveCount(
      0,
    );

    await button("Tuần sau").click();
    await expect(first).toHaveCount(0);
    await button("Tuần trước").click();
    await expect(second).toContainText("Đã đặt");
    await expect(grid).not.toContainText("Vào mục Lịch hẹn");
    await second.click();
    await expect(dialog).toContainText("Vào mục Lịch hẹn");
    await expect(dialog.getByRole("button")).toHaveCount(1);
    await button("Đóng").click();
    await first.click();
    await button("Mở lại ca").click();
    await button("Xác nhận").click();
    await expect(first).toContainText("Còn trống");
    await first.click();
    await button("Xóa ca").click();
    await button("Hủy").click();
    await button("Đóng").click();
    await expect(first).toBeVisible();
    await first.click();
    await button("Xóa ca").click();
    await button("Xác nhận").click();
    await expect(first).toHaveCount(0);

    const begins = Date.parse(created.slots[2].startTime);
    await page.clock.setFixedTime(new Date(begins - 24 * 3600000));
    await third.click();
    await expect(dialog.getByRole("button", { name: "Báo bận" })).toBeEnabled();
    await button("Đóng").click();
    await page.clock.setFixedTime(new Date(begins - 24 * 3600000 + 1));
    await third.click();
    await expect(dialog).toContainText("tối thiểu 24 giờ");
    await expect(dialog.getByRole("button")).toHaveCount(1);
    await button("Đóng").click();
    await page.clock.setFixedTime(new Date(begins + 3600000));
    await page.reload();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(grid.getByRole("group")).toHaveCount(1);
    await expect(grid.getByRole("button", { name: /Hôm nay/ })).toHaveAttribute(
      "aria-current",
      "date",
    );
    await expect(third).toContainText("Đã qua · Không có lịch hẹn");
    await expect(second).toContainText("Đã đặt");
    await third.click();
    await expect(dialog).toContainText("Ca đã bắt đầu");
    await button("Đóng").click();
    await register.click();
    await expect(dialog.getByRole("alert")).toContainText("trong tương lai");
    await expect(save).toBeDisabled();
    await button("Đóng").click();
    await grid
      .locator(".schedule-days button[aria-pressed='false']")
      .first()
      .click();
    await expect(grid.getByRole("group")).toHaveText("Chưa đăng ký");
    expect(
      await grid.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  } finally {
    if (ids.length)
      await db.workingSlot.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
});
