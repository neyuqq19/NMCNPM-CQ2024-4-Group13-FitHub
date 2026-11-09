import { test, expect, type Page } from "@playwright/test";
import { checkInFixture } from "../../backend/test/check-in-fixture";
const api = "http://127.0.0.1:3101";
async function login(page: Page) {
  await page.goto("/");
  await page
    .getByLabel("Email hoặc số điện thoại", { exact: true })
    .fill("admin@fithub.vn");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("FitHubDemo!2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Hội viên", exact: true }),
  ).toBeVisible();
}
async function order(page: Page) {
  const f = await checkInFixture(false);
  await page.goto(`/#/members/${f.memberId}`);
  await page
    .getByRole("link", { name: "Đăng ký gói tập", exact: true })
    .click();
  await expect(page.getByLabel("Gói tập", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Tiếp tục thu tiền", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Xác nhận thu tiền", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Chờ thanh toán", { exact: true })).toBeVisible();
  return f;
}
test("DB sales web: real package/order/payment survives response loss, reload and cleared local business storage", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "fithub-web-demo-v2",
      JSON.stringify({
        members: [{ id: "FAKE", name: "Phantom local customer" }],
        payments: [],
      }),
    ),
  );
  await login(page);
  const f = await order(page);
  const paymentId = page.url().split("/").pop()!;
  const memberLogin = await page.request.post(`${api}/api/auth/login`, {
    data: {
      identifier: f.email,
      password: f.password,
      platform: "MOBILE",
      deviceId: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
    },
  });
  const memberToken = (await memberLogin.json()).accessToken;
  const headers = { Authorization: `Bearer ${memberToken}` };
  expect(
    (await page.request.post(`${api}/api/check-ins/qr`, { headers })).status(),
  ).toBe(409);
  let lost = false;
  await page.route("**/api/payments/*/confirm", async (route) => {
    const r = await route.fetch();
    if (!lost) {
      lost = true;
      await route.abort("failed");
    } else await route.fulfill({ response: r });
  });
  await page.getByRole("button", { name: /Đã nhận .* Xác nhận/ }).click();
  await expect(page.getByText(/Không kết nối được máy chủ/)).toBeVisible();
  await page.getByRole("button", { name: /Đã nhận .* Xác nhận/ }).click();
  await expect(
    page.getByRole("heading", { name: "Thu tiền thành công", exact: true }),
  ).toBeVisible();
  const adminToken = await page.evaluate(() =>
    sessionStorage.getItem("fithub_token"),
  );
  const list = await page.request.get(
    `${api}/api/payments?member=${f.memberId}`,
    { headers: { Authorization: `Bearer ${adminToken}` } },
  );
  expect((await list.json()).total).toBe(1);
  expect(
    (await page.request.post(`${api}/api/check-ins/qr`, { headers })).status(),
  ).toBe(200);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Thu tiền thành công", exact: true }),
  ).toBeVisible();
  expect(page.url()).toContain(paymentId);
  await page.getByRole("link", { name: "Xem giao dịch", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(
    page.getByText("Đã thu · Tiền mặt", { exact: true }),
  ).toBeVisible();
  await page.goto("/#/");
  await expect(page.getByRole("heading", { name: /Xin chào/ })).toBeVisible();
  await expect(page.getByText(/Phantom local customer/)).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Doanh thu", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/database-dashboard.png",
    fullPage: true,
  });
});
test("DB sales web: cancel pending order persists without entitlement; history filters, retry and mobile width", async ({
  page,
}) => {
  await login(page);
  const f = await order(page);
  await page.getByRole("button", { name: "Hủy đăng ký", exact: true }).click();
  await page.getByRole("button", { name: "Không hủy", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Đã nhận .* Xác nhận/ }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Hủy đăng ký", exact: true }).click();
  await page.getByRole("button", { name: "Xác nhận hủy", exact: true }).click();
  await expect(
    page.getByText("Đăng ký đã hủy, chưa phát sinh quyền vào tập.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText("Đã hủy", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/#/history?member=${f.memberId}&status=CANCELLED`);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByLabel("Tìm giao dịch", { exact: true })
    .fill("no-such-payment");
  await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Chưa có giao dịch" }),
  ).toBeVisible();
  await page.route("**/api/payments?**", (r) => r.abort());
  await page.getByRole("button", { name: "Làm mới", exact: true }).click();
  await expect(page.getByText(/Không kết nối được máy chủ/)).toBeVisible();
  await page.unroute("**/api/payments?**");
  await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Chưa có giao dịch" }),
  ).toBeVisible();
});
