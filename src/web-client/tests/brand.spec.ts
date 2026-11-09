import { test, expect } from "@playwright/test";

test("Web brand: cropped artwork, correct background variants, responsive header and favicon", async ({
  page,
}) => {
  await page.goto("/#/login");
  for (const width of [390, 768, 1280, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    const brand = page.locator(".admin-login-layout .brand:visible");
    await expect(brand).toHaveCount(1);
    await expect(brand).toHaveAttribute("aria-label", "FitHub — Trang chủ");
    await expect(brand.locator(".brand-icon img")).toHaveAttribute(
      "src",
      "/fithub-mark.png",
    );
    await expect(brand.locator(".brand-wordmark")).toHaveAttribute(
      "src",
      width >= 640 ? "/fithub-wordmark-inverse.png" : "/fithub-wordmark.png",
    );
    await expect
      .poll(() =>
        brand
          .locator(".brand-wordmark")
          .evaluate((e) => (e as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    const word = await brand.locator(".brand-wordmark").evaluate((e) => {
      const i = e as HTMLImageElement,
        r = i.getBoundingClientRect();
      return {
        ratio: r.width / r.height,
        natural: i.naturalWidth / i.naturalHeight,
      };
    });
    expect(Math.abs(word.ratio - word.natural)).toBeLessThan(0.02);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await page
        .locator(".admin-login-page")
        .evaluate((e) => getComputedStyle(e).backgroundColor),
    ).toBe("rgb(241, 246, 245)");
    if (width === 390 || width === 1920)
      await page.screenshot({
        path: `test-results/fh-brand-login-${width}.png`,
        fullPage: true,
      });
  }
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    "/fithub-favicon.png",
  );
  const favicon = await page.request.get("/fithub-favicon.png");
  expect(favicon.ok()).toBe(true);
  expect(favicon.headers()["content-type"]).toContain("image/png");
  await page
    .getByLabel("Email hoặc số điện thoại", { exact: true })
    .fill("admin@fithub.vn");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("FitHubDemo!2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Hội viên", exact: true }),
  ).toBeVisible();
  for (const width of [390, 768, 1280, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    const brand = page.getByRole("link", {
      name: "FitHub — Trang chủ",
      exact: true,
    });
    await expect(brand.locator(".brand-wordmark")).toHaveAttribute(
      "src",
      "/fithub-wordmark.png",
    );
    const logo = await brand.boundingBox(),
      logout = await page
        .getByRole("button", { name: "Đăng xuất", exact: true })
        .boundingBox();
    expect(logo!.x + logo!.width).toBeLessThan(logout!.x);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page
    .getByRole("link", { name: "FitHub — Trang chủ", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: /Xin chào/ })).toBeVisible();
  await page.screenshot({
    path: "test-results/fh-brand-header.png",
    fullPage: true,
  });
});
