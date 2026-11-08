import { test, expect, type Page } from "@playwright/test";
const api = "http://127.0.0.1:3102";
const password = "MobileTest!2026";

test("mobile: login/register stay scrollable in a keyboard-sized viewport", async ({
  page,
}) => {
  await page.goto("/");
  const input = page.getByLabel("Mật khẩu", { exact: true });
  await input.fill("KeyboardTest9");
  await page.setViewportSize({ width: 390, height: 460 });
  await input.focus();
  await input.scrollIntoViewIfNeeded();
  const bounds = await input.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(460);
  await page
    .getByRole("button", { name: "Đăng nhập", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(input).toHaveValue("KeyboardTest9");
  await page.getByRole("tab", { name: "Đăng ký", exact: true }).click();
  const confirmation = page.getByLabel("Xác nhận mật khẩu", { exact: true });
  await confirmation.fill("KeyboardTest9");
  await confirmation.scrollIntoViewIfNeeded();
  const confirmationBounds = await confirmation.boundingBox();
  expect(
    confirmationBounds!.y + confirmationBounds!.height,
  ).toBeLessThanOrEqual(460);
  await page
    .getByRole("button", { name: "Đăng ký", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/auth-small-keyboard-viewport.png",
    fullPage: true,
  });
});
async function registration(page: Page, email: string) {
  await page.goto("/");
  await page.getByRole("tab", { name: "Đăng ký", exact: true }).click();
  await page
    .getByLabel("Họ tên (không bắt buộc)", { exact: true })
    .fill("Hội viên mobile");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByLabel("Xác nhận mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng ký", exact: true }).click();
  await expect(page.getByLabel("Mã OTP", { exact: true })).toBeVisible();
}
async function activate(page: Page, email: string) {
  const response = await page.request.get(
    `${api}/__test/otp?email=${encodeURIComponent(email)}`,
  );
  const { code } = await response.json();
  expect(code).toMatch(/^\d{6}$/);
  await page.getByLabel("Mã OTP", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Xác nhận OTP", exact: true }).click();
  await expect(
    page.getByText(
      "Xác minh thành công! Hãy đăng nhập bằng mật khẩu đã đăng ký.",
    ),
  ).toBeVisible();
}
test("mobile: email registration, wrong OTP, activation, real login, persisted session and server logout", async ({
  page,
}) => {
  const email = `mobile-${crypto.randomUUID()}@example.com`;
  await registration(page, email);
  await expect(
    page.getByRole("button", { name: /Gửi lại mã sau/ }),
  ).toBeDisabled();
  const { code } = await (
    await page.request.get(
      `${api}/__test/otp?email=${encodeURIComponent(email)}`,
    )
  ).json();
  await page
    .getByLabel("Mã OTP", { exact: true })
    .fill(code === "000000" ? "000001" : "000000");
  await page.getByRole("button", { name: "Xác nhận OTP", exact: true }).click();
  await expect(
    page.getByText("Mã xác minh không chính xác.", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/mobile-otp.png",
    fullPage: true,
  });
  await activate(page, email);
  await expect(
    page.getByLabel("Email hoặc số điện thoại", { exact: true }),
  ).toHaveValue(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByText("HI VIÊN MOBILE", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("HI VIÊN MOBILE", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/mobile-authenticated.png",
    fullPage: true,
  });
  const stored = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("fithub.mobile.session")!),
  );
  // A DHCP/IP change must not leave restored sessions pinned to the old host.
  await page.evaluate(() => {
    const key = "fithub.mobile.session";
    const session = JSON.parse(sessionStorage.getItem(key)!);
    sessionStorage.setItem(
      key,
      JSON.stringify({ ...session, baseUrl: "http://192.0.2.1:3000" }),
    );
  });
  await page.reload();
  await expect(page.getByText("HI VIÊN MOBILE", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(sessionStorage.getItem("fithub.mobile.session")!).baseUrl,
    ),
  ).toBe(api);
  await page
    .getByRole("button", { name: "Hồ sơ cá nhân", exact: true })
    .click();
  await expect(page.getByText("Chưa cung cấp", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Ảnh đại diện mặc định", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Phiên đăng nhập", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByText("Nguồn kết nối", { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: "test-results/mobile-profile-default-avatar.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Đăng xuất khỏi thiết bị", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Đăng nhập", exact: true }),
  ).toBeVisible();
  const check = await page.request.get(`${api}/api/auth/me`, {
    headers: { Authorization: `Bearer ${stored.accessToken}` },
  });
  expect(check.status()).toBe(401);
});
test("mobile: validation and API failure never fall back to seed authentication", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(
    page.getByText("Nhập email/số điện thoại và mật khẩu."),
  ).toBeVisible();
  await page
    .getByLabel("Email hoặc số điện thoại", { exact: true })
    .fill("minhanh@example.com");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("FitHubDemo!2026");
  await page.route("**/api/auth/login", (route) => route.abort());
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(
    page.getByText(
      "Không kết nối được máy chủ. Vui lòng kiểm tra kết nối và thử lại.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Đăng nhập", exact: true }),
  ).toBeVisible();
  await page.unroute("**/api/auth/login");
  await page.getByRole("tab", { name: "Đăng ký", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill("bad");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("short");
  await page.getByRole("button", { name: "Đăng ký", exact: true }).click();
  await expect(
    page.getByText("Mật khẩu cần ít nhất 8 ký tự, gồm chữ và số."),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/mobile-register.png",
    fullPage: true,
  });
});
test("mobile: mail failure stays unverified and existing verified email cannot register twice", async ({
  page,
}) => {
  await page.request.post(`${api}/__test/delivery-failure?enabled=true`);
  try {
    await registration(page, `failure-${crypto.randomUUID()}@example.com`);
    await expect(
      page.getByText("Chưa gửi được email. Bạn có thể thử gửi lại sau."),
    ).toBeVisible();
  } finally {
    await page.request.post(`${api}/__test/delivery-failure?enabled=false`);
  }
  await page.goto("/");
  await page.getByRole("tab", { name: "Đăng ký", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill("minhanh@example.com");
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByLabel("Xác nhận mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng ký", exact: true }).click();
  await expect(
    page.getByText(
      "Email không thể dùng để đăng ký. Hãy đăng nhập hoặc liên hệ lễ tân.",
    ),
  ).toBeVisible();
});

test("mobile: another device revokes the restored session", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Email hoặc số điện thoại", { exact: true })
    .fill("hoangnam@example.com");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("FitHubDemo!2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByText("HI HOÀNG NAM", { exact: true })).toBeVisible();
  const other = await page.request.post(`${api}/api/auth/login`, {
    data: {
      identifier: "hoangnam@example.com",
      password: "FitHubDemo!2026",
      platform: "MOBILE",
      deviceId: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
    },
  });
  expect(other.ok()).toBeTruthy();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Đăng nhập", exact: true }),
  ).toBeVisible();
});

test("mobile: auth tabs and independent password eyes replace settings and text toggles", async ({
  page,
}) => {
  await page.goto("/");
  const loginTab = page.getByRole("tab", { name: "Đăng nhập", exact: true });
  const registerTab = page.getByRole("tab", { name: "Đăng ký", exact: true });
  await expect(loginTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("API", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("Cấu hình Kết nối & Tài khoản", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("Hiện mật khẩu", { exact: true })).toHaveCount(0);
  const password = page.getByLabel("Mật khẩu", { exact: true });
  await password.fill("SamplePassword9");
  await expect(password).toHaveAttribute("type", "password");
  await page
    .getByRole("button", { name: "Hiện mật khẩu", exact: true })
    .click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(password).toHaveValue("SamplePassword9");
  await page.getByRole("button", { name: "Ẩn mật khẩu", exact: true }).click();
  await expect(password).toHaveAttribute("type", "password");
  await page.screenshot({
    path: "test-results/mobile-login-tabs.png",
    fullPage: true,
  });
  await registerTab.click();
  await expect(registerTab).toHaveAttribute("aria-selected", "true");
  await password.fill("SamplePassword9");
  const confirmation = page.getByLabel("Xác nhận mật khẩu", { exact: true });
  await confirmation.fill("SamplePassword9");
  await page
    .getByRole("button", { name: "Hiện mật khẩu", exact: true })
    .click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(confirmation).toHaveAttribute("type", "password");
  await page
    .getByRole("button", { name: "Hiện xác nhận mật khẩu", exact: true })
    .click();
  await expect(confirmation).toHaveAttribute("type", "text");
  await loginTab.click();
  await expect(password).toHaveValue("");
  await expect(password).toHaveAttribute("type", "password");
});
