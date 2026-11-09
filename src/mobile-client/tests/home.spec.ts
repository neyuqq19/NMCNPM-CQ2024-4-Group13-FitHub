import { test, expect } from "@playwright/test";
import { checkInFixture } from "../../backend/test/check-in-fixture";
test("Home: responsive real membership, weekly progress, no QR issued until requested", async ({
  page,
}) => {
  const f = await checkInFixture(true);
  let issued = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/check-ins/qr")) issued++;
  });
  await page.goto("/");
  await page
    .getByLabel("Email hoặc số điện thoại", { exact: true })
    .fill(f.email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(f.password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByText("GÓI TẬP HIỆN TẠI")).toBeVisible();
  await expect(page.getByText("Đã tập trong tuần")).toBeAttached();
  expect(issued).toBe(0);
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: `test-results/home-${width}.png` });
  }
  await page.getByRole("button", { name: "Tiến độ", exact: true }).click();
  await expect(page.getByText("Đã tập trong tuần")).toBeVisible();
  await page.getByRole("button", { name: "Mã QR", exact: true }).click();
  await expect(page.getByTestId("checkin-qr")).toBeVisible();
  expect(issued).toBeGreaterThan(0);
});
