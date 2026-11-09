import { test, expect, type Page } from "@playwright/test";
import { checkInFixture } from "../../backend/test/check-in-fixture";

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
}
async function fillsAvailableWidth(page: Page) {
  const main = page.locator("#main-content");
  const metrics = await main.evaluate((element) => {
    const rect = element.getBoundingClientRect(),
      style = getComputedStyle(element);
    const sidebar = document.querySelector(".sidebar")!.getBoundingClientRect();
    return {
      right: rect.right,
      left: rect.left,
      width: rect.width,
      viewport: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      padLeft: parseFloat(style.paddingLeft),
      padRight: parseFloat(style.paddingRight),
      sidebarRight: sidebar.right,
    };
  });
  expect(Math.abs(metrics.right - metrics.viewport)).toBeLessThanOrEqual(1);
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewport + 1);
  expect(metrics.padLeft).toBe(metrics.padRight);
  if (metrics.viewport > 680)
    expect(metrics.left).toBeGreaterThanOrEqual(metrics.sidebarRight - 1);
  else expect(metrics.left).toBe(0);
  const panel = main
    .locator(
      ".dashboard-stats, .panel:not(.dashboard-chart):not(.dashboard-activity)",
    )
    .first();
  if (await panel.count()) {
    const rect = await panel.boundingBox();
    expect(
      Math.abs(rect!.x + rect!.width - (metrics.viewport - metrics.padRight)),
    ).toBeLessThanOrEqual(1);
  }
}
for (const width of [390, 768, 1280, 1920, 2560]) {
  test(`Admin layout: all pages fill available space at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const f = await checkInFixture(false);
    await login(page);
    for (const [path, heading] of [
      ["/", /^Xin chào/],
      ["/members", "Hội viên"],
      [`/members/${f.memberId}`, "Hội viên"],
      [`/members/${f.memberId}/package`, "Đăng ký gói tập"],
      ["/history", "Giao dịch"],
      ["/check-in", "Check-in hội viên"],
    ] as const) {
      await page.goto(`/#${path}`);
      await expect(
        page
          .getByRole("heading", {
            name: heading,
            exact: typeof heading === "string",
          })
          .first(),
      ).toBeVisible();
      await expect(page.getByText(/Đang tải/)).toHaveCount(0);
      await fillsAvailableWidth(page);
      if (path === "/members") {
        await expect(page.locator(".member-action").first()).toBeVisible();
        if (width >= 1280)
          expect(
            await page
              .locator("h1")
              .evaluate((e) => getComputedStyle(e).fontSize),
          ).toBe("28px");
        if (width === 390 || width >= 1920)
          await page.screenshot({
            path: `test-results/fluid-members-${width}.png`,
            fullPage: true,
          });
      }
      if (path === "/check-in") {
        const video = page.getByLabel("Khung camera quét QR");
        expect(await video.evaluate((e) => getComputedStyle(e).objectFit)).toBe(
          "contain",
        );
        expect(await video.evaluate((e) => getComputedStyle(e).maxHeight)).toBe(
          "420px",
        );
      }
    }
  });
}

// Browser zoom changes the CSS viewport and DPR together. Reproduce that layout
// on a fixed 1920x1080 screen, rather than applying a CSS transform to the page.
for (const zoom of [1, 0.8, 0.67]) {
  test(`Admin layout: fills a 1920px screen at ${Math.round(zoom * 100)}% zoom metrics`, async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({
      baseURL,
      viewport: {
        width: Math.round(1920 / zoom),
        height: Math.round(1080 / zoom),
      },
      deviceScaleFactor: zoom,
    });
    try {
      const page = await context.newPage();
      await login(page);
      await fillsAvailableWidth(page);
      expect(
        await page.locator("h1").evaluate((e) => getComputedStyle(e).fontSize),
      ).toBe("28px");
      expect(await page.evaluate(() => devicePixelRatio)).toBeCloseTo(zoom, 2);
    } finally {
      await context.close();
    }
  });
}
