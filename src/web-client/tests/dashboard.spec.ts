import { test, expect, type Page } from "@playwright/test";
async function login(page: Page) {
  await page.goto("/#/login");
  await page
    .getByLabel("Email hoặc số điện thoại", { exact: true })
    .fill("admin@fithub.vn");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("FitHubDemo!2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Hội viên", exact: true }),
  ).toBeVisible();
  await page.goto("/#/");
  await expect(page.locator(".dashboard-stat")).toHaveCount(4);
}
test("Dashboard: real date/range controls, accessible chart and light shell at all widths", async ({
  page,
}) => {
  await login(page);
  const date = page.getByLabel("Ngày thống kê", { exact: true });
  await date.fill("2024-02-29");
  await page.getByRole("button", { name: "Tháng này", exact: true }).click();
  await expect(page.locator(".dashboard-bar")).toHaveCount(29);
  await expect(
    page.locator(".dashboard-stat").filter({ hasText: "Hiện tại" }),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "7 ngày", exact: true }).click();
  await expect(page.locator(".dashboard-bar")).toHaveCount(7);
  await page.locator(".dashboard-bar").first().focus();
  await expect(
    page.locator(".dashboard-bar").first().locator(".dashboard-tooltip"),
  ).toBeVisible();
  await page.locator("h1").focus();
  await date.fill(
    new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10),
  );
  await expect(page.locator(".dashboard-stat")).toHaveCount(4);
  for (const width of [390, 768, 1280, 1920, 2560]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await page
        .locator(".sidebar")
        .evaluate((e) => getComputedStyle(e).backgroundColor),
    ).toBe("rgb(255, 255, 255)");
    await page.screenshot({
      path: `test-results/dashboard-light-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  await page.getByRole("button", { name: "Làm mới", exact: true }).click();
  await expect(
    page.getByText("Đã cập nhật dữ liệu", { exact: true }),
  ).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .locator(".dashboard-bar")
      .first()
      .evaluate((e) => getComputedStyle(e).animationName),
  ).toBe("none");
});
test("Dashboard: stale response cannot replace newer selection; network failure can retry", async ({
  page,
}) => {
  await login(page);
  await page.route("**/api/dashboard?**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("date") === "2024-01-01")
      await new Promise((r) => setTimeout(r, 600));
    await route.continue();
  });
  const date = page.getByLabel("Ngày thống kê", { exact: true });
  await date.fill("2024-01-01");
  await date.fill("2024-01-02");
  await expect(page.locator(".dashboard-stat")).toHaveCount(4);
  await page.waitForTimeout(800);
  await expect(page.locator(".dashboard-stat").nth(1)).toContainText(
    "02/01/2024",
  );
  await page.unroute("**/api/dashboard?**");
  await page.route("**/api/dashboard?**", (r) => r.abort());
  await page.getByRole("button", { name: "Làm mới", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".dashboard-stat")).toHaveCount(0);
  await page.unroute("**/api/dashboard?**");
  await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(page.locator(".dashboard-stat")).toHaveCount(4);
});
