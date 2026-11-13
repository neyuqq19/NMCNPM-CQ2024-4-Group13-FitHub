import { expect, test } from "@playwright/test";
import type { WorkingSlotDto } from "@fithub/contracts";
import { checkInFixture } from "../../backend/test/check-in-fixture";

test("hội viên lọc PT, xem chứng chỉ và quay lại kết quả", async ({ page }) => {
  const member = await checkInFixture(false);
  await page.goto("/");
  await page
    .getByLabel("Email hoặc số điện thoại", { exact: true })
    .fill(member.email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(member.password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.getByRole("button", { name: "Tìm huấn luyện viên" }).click();

  const trainer = page.getByRole("button", {
    name: "Xem hồ sơ Huấn luyện viên mẫu",
    exact: true,
  });
  await expect(trainer).toBeVisible();
  const name = page.getByLabel("Tên huấn luyện viên", { exact: true });
  const specialty = page.getByLabel("Chuyên môn", { exact: true });
  const search = page.getByRole("button", { name: "Tìm kiếm" });
  await name.fill("Huấn luyện viên mẫu");
  await specialty.fill("Calisthenics");
  await search.click();
  await expect(
    page.getByText("Không tìm thấy huấn luyện viên phù hợp."),
  ).toBeVisible();

  await specialty.fill("Phục hồi chấn thương");
  await search.click();
  await trainer.click();
  await expect(page.getByText("Corrective Exercise Specialist")).toBeVisible();
  await expect(page.getByText("NASM · 18/08/2023")).toBeVisible();
  const nextDay = page.getByRole("button", { name: "Ngày sau" });
  for (const offset of [1, 2, 3]) {
    const date = new Date(Date.now() + (7 + offset * 24) * 3600_000)
      .toISOString()
      .slice(0, 10);
    const [response] = await Promise.all([
      page.waitForResponse((res) =>
        res.url().endsWith(`/available-slots?date=${date}`),
      ),
      nextDay.click(),
    ]);
    expect(response.ok()).toBeTruthy();
    const slots: WorkingSlotDto[] = await response.json();
    const time = (instant: string) =>
      new Date(Date.parse(instant) + 7 * 3600_000).toISOString().slice(11, 16);
    const intervals = slots.map(
      (slot) => `${time(slot.startTime)} – ${time(slot.endTime)}`,
    );
    if (offset !== 2) {
      expect(intervals).toEqual(
        expect.arrayContaining([
          "08:00 – 09:00",
          "09:15 – 10:15",
          "10:30 – 11:30",
        ]),
      );
    }
    if (!intervals.length) {
      await expect(
        page.getByText("Chưa có ca trống trong ngày này."),
      ).toBeVisible();
    } else {
      for (const interval of intervals) {
        await expect(page.getByText(interval, { exact: true })).toBeVisible();
      }
    }
  }
  await page.getByRole("button", { name: "Đóng hồ sơ" }).click();
  await expect(trainer).toBeVisible();
  await expect(specialty).toHaveValue("Phục hồi chấn thương");
});
