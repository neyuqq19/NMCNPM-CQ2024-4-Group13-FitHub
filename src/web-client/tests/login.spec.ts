import { test, expect } from "@playwright/test";

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]) {
  test(`Admin login: light layout at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/#/login");
    await expect(
      page.getByRole("heading", { name: "Đăng nhập nhân viên", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Email hoặc số điện thoại", { exact: true }),
    ).toHaveValue("");
    await expect(
      page.getByText("Tài khoản phát triển", { exact: true }),
    ).toHaveCount(0);
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
    if (viewport.width >= 640) {
      await expect(page.locator(".admin-login-photo")).toBeVisible();
      expect(
        await page
          .locator(".admin-login-photo")
          .evaluate((e) => (e as HTMLImageElement).naturalWidth),
      ).toBeGreaterThan(0);
    } else await expect(page.locator(".admin-login-hero")).toBeHidden();
    if (viewport.width >= 960) {
      const hero = await page.locator(".admin-login-hero").boundingBox(),
        form = await page.locator(".admin-login-form-panel").boundingBox();
      expect(hero!.x + hero!.width).toBeLessThanOrEqual(form!.x + 1);
    }
    await page.screenshot({
      path: `test-results/admin-login-${viewport.width}.png`,
      fullPage: true,
    });
  });
}

test("Admin login: field errors, keyboard, password eye and successful real login", async ({
  page,
}) => {
  await page.goto("/#/login");
  let requests = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/auth/login")) requests++;
  });
  const identifier = page.getByLabel("Email hoặc số điện thoại", {
      exact: true,
    }),
    password = page.getByLabel("Mật khẩu", { exact: true });
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(
    page.getByText("Nhập email hoặc số điện thoại.", { exact: true }),
  ).toBeVisible();
  await expect(identifier).toBeFocused();
  expect(requests).toBe(0);
  await identifier.fill("admin@fithub.vn");
  await page.keyboard.press("Tab");
  await expect(password).toBeFocused();
  await password.fill("FitHubDemo!2026");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Hiện mật khẩu", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Space");
  await expect(password).toHaveAttribute("type", "text");
  expect(requests).toBe(0);
  await page.getByRole("button", { name: "Ẩn mật khẩu", exact: true }).click();
  await expect(password).toHaveAttribute("type", "password");
  await password.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Hội viên", exact: true }),
  ).toBeVisible();
  expect(requests).toBe(1);
});

test("Admin login: wrong password and network failure retain input; pending request prevents double submission", async ({
  page,
}) => {
  await page.goto("/#/login");
  const identifier = page.getByLabel("Email hoặc số điện thoại", {
      exact: true,
    }),
    password = page.getByLabel("Mật khẩu", { exact: true });
  await identifier.fill("admin@fithub.vn");
  await password.fill("IncorrectPassword9");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Thông tin đăng nhập hoặc mật khẩu không chính xác.",
  );
  await expect(password).toHaveValue("IncorrectPassword9");
  let release!: () => void;
  const wait = new Promise<void>((r) => (release = r));
  let requests = 0;
  await page.route("**/api/auth/login", async (route) => {
    requests++;
    await wait;
    await route.abort("failed");
  });
  await password.fill("FitHubDemo!2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Đang đăng nhập…", exact: true }),
  ).toBeDisabled();
  await expect(identifier).toBeDisabled();
  await expect(password).toBeDisabled();
  release();
  await expect(page.getByRole("alert")).toContainText(
    "Không kết nối được máy chủ.",
  );
  await expect(identifier).toHaveValue("admin@fithub.vn");
  await expect(password).toHaveValue("FitHubDemo!2026");
  expect(requests).toBe(1);
});

test("Admin login: member account is rejected and its session cleared", async ({
  page,
}) => {
  await page.goto("/#/login");
  await page
    .getByLabel("Email hoặc số điện thoại", { exact: true })
    .fill("hoangnam@example.com");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("FitHubDemo!2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Tài khoản Hội viên chỉ sử dụng trên ứng dụng FitHub Mobile.",
  );
  expect(
    await page.evaluate(() => sessionStorage.getItem("fithub_token")),
  ).toBeNull();
  await expect(
    page.getByRole("heading", { name: "Đăng nhập nhân viên", exact: true }),
  ).toBeVisible();
});

test("Admin login: photo failure keeps the introduction and form usable", async ({
  page,
}) => {
  await page.route("**/login-gym.jpg", (r) => r.abort());
  await page.goto("/#/login");
  await expect(
    page.getByRole("heading", { name: "Vận hành phòng tập dễ dàng hơn." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Đăng nhập", exact: true }),
  ).toBeEnabled();
});
