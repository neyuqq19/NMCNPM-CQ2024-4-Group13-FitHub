// UC13 — acceptance flow from the spec, on the real API + PostgreSQL (fithub_test).
import { test, expect, type Page } from "@playwright/test";
import { checkInFixture } from "../../backend/test/check-in-fixture";

async function login(page: Page, email: string, password: string) {
  await page.goto("/");
  await page.getByLabel("Email hoặc số điện thoại", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByText("GÓI TẬP HIỆN TẠI")).toBeVisible();
}
async function fillSet(page: Page, n: number, type: "W" | "R", kg: string, reps: string) {
  await page.getByRole("button", { name: `Hiệp ${n}: ${type === "W" ? "Khởi động" : "Hiệp chính"}` }).click();
  await page.getByLabel(`Back Squat hiệp ${n} mức tạ kg`).fill(kg);
  await page.getByLabel(`Back Squat hiệp ${n} số lần`).fill(reps);
  await page.getByRole("checkbox", { name: `Hoàn thành hiệp ${n} Back Squat` }).click();
}

test("UC13: log sets with rest timer, baseline 1RM, then a new PR badge; history persists", async ({ page }) => {
  const f = await checkInFixture(true);
  await login(page, f.email, f.password);

  await page.getByRole("button", { name: "Mở nhật ký tập luyện" }).click();
  await expect(page.getByText("Nhật ký tập luyện", { exact: true })).toBeVisible();

  // Session 1: W 60x10, R 100x5 -> volume 1100 kg, 1RM 116.67 baseline.
  await page.getByLabel("Tiêu đề buổi tập").fill("Leg Day");
  await page.getByRole("button", { name: "+ Back Squat" }).click();
  await fillSet(page, 1, "W", "60", "10");
  await expect(page.getByTestId("rest-timer")).toBeVisible();
  await expect(page.getByLabel(/Còn (89|90) giây nghỉ/)).toBeVisible();
  await page.getByText("+ Thêm hiệp").click();
  await fillSet(page, 2, "R", "100", "5");
  await expect(page.getByText("1RM ≈ 116,67")).toBeVisible();
  await page.screenshot({ path: "test-results/workout-log-form.png", fullPage: true });
  await page.getByRole("button", { name: "Lưu buổi tập" }).click();
  await expect(page.getByTestId("save-result")).toContainText("Tổng khối lượng: 1.100 kg");
  await expect(page.getByTestId("save-result")).not.toContainText("KỶ LỤC");

  await page.getByRole("tab", { name: "Kỷ lục PR" }).click();
  await expect(page.getByText("116,67 kg")).toBeVisible();
  await expect(page.getByText("Mốc cơ sở")).toBeVisible();

  // Session 2: R 105x5 -> 1RM 122.5 > 116.67 -> new PR.
  await page.getByRole("tab", { name: "Buổi tập mới" }).click();
  await page.getByLabel("Tiêu đề buổi tập").fill("Leg Day 2");
  await page.getByRole("button", { name: "+ Back Squat" }).click();
  await fillSet(page, 1, "R", "105", "5");
  await page.getByRole("button", { name: "Lưu buổi tập" }).click();
  await expect(page.getByTestId("save-result")).toContainText(
    "🏆 KỶ LỤC CÁ NHÂN MỚI (PR): 122,5 kg — Back Squat",
  );
  await page.screenshot({ path: "test-results/workout-log-pr.png", fullPage: true });

  // Reopen the app: history and records come back from PostgreSQL.
  await page.reload();
  await expect(page.getByText("GÓI TẬP HIỆN TẠI")).toBeVisible();
  const card = page.getByRole("button", { name: "Mở nhật ký tập luyện" });
  await expect(card).toContainText("2 buổi đã ghi trong tháng");
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/workout-log-home.png" });
  await card.click();
  await page.getByRole("tab", { name: "Lịch sử" }).click();
  await expect(page.getByText("Leg Day 2")).toBeVisible();
  await expect(page.getByText("Leg Day", { exact: true })).toBeVisible();
  await expect(page.getByText("buổi trong tháng")).toBeVisible();
  await page.getByRole("tab", { name: "Kỷ lục PR" }).click();
  await expect(page.getByText("122,5 kg")).toBeVisible();
  await expect(page.getByText("🏆 PR")).toBeVisible();

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: "test-results/workout-log-records.png", fullPage: true });
});
