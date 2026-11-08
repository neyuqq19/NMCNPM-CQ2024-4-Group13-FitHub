import { test, expect, type Page } from "@playwright/test";
import { checkInFixture } from "../../backend/test/check-in-fixture";
const api = "http://127.0.0.1:3102";
async function login(page: Page, hasPackage = true) {
  const f = await checkInFixture(hasPackage);
  await page.goto("/");
  await page
    .getByLabel("Email hoặc số điện thoại", { exact: true })
    .fill(f.email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(f.password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.getByRole("button", { name: "Check-in", exact: true }).click();
  return f;
}
test("UC03 mobile: real QR cannot be tapped to succeed; server scan drives success and reload retains cooldown", async ({
  page,
}) => {
  const q = page.waitForResponse((r) => r.url().endsWith("/api/check-ins/qr"));
  await login(page);
  const issued = await (await q).json();
  await expect(page.getByTestId("checkin-qr")).toBeVisible();
  await page.getByTestId("checkin-qr").click();
  await expect(
    page.getByText("Check-in thành công", { exact: true }),
  ).toHaveCount(0);
  const a = await page.request.post(`${api}/api/auth/login`, {
    data: {
      identifier: "admin@fithub.vn",
      password: "FitHubDemo!2026",
      platform: "WEB",
      deviceId: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
    },
  });
  const { accessToken } = await a.json();
  const headers = { Authorization: `Bearer ${accessToken}` };
  const scanner = await page.request.post(`${api}/api/check-ins/scanners`, {
    headers,
    data: { deviceId: crypto.randomUUID(), label: "Quầy mobile test" },
  });
  const scan = await page.request.post(`${api}/api/check-ins/scan`, {
    headers,
    data: {
      scannerId: (await scanner.json()).id,
      requestId: crypto.randomUUID(),
      payload: issued.payload,
    },
  });
  expect((await scan.json()).accepted).toBe(true);
  await expect(
    page.getByText("Check-in thành công", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("checkin-qr")).toHaveCount(0);
  await page.screenshot({
    path: "test-results/mobile-check-in-accepted.png",
    fullPage: true,
  });
  await page.reload();
  await page.getByRole("button", { name: "Check-in", exact: true }).click();
  await expect(
    page.getByText("Chưa thể check-in lại trong vòng 10 phút.", {
      exact: true,
    }),
  ).toBeVisible();
});
test("UC03 mobile: no package and disconnected API show errors without sample QR", async ({
  page,
}) => {
  await login(page, false);
  await expect(
    page.getByText(/Bạn chưa có gói tập đủ điều kiện/),
  ).toBeVisible();
  await expect(page.getByTestId("checkin-qr")).toHaveCount(0);
  await page.route("**/api/check-ins/qr", (r) => r.abort());
  await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(page.getByText(/Không kết nối được máy chủ/)).toBeVisible();
  await expect(page.getByTestId("checkin-qr")).toHaveCount(0);
  await page.unroute("**/api/check-ins/qr");
  await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(
    page.getByText(/Bạn chưa có gói tập đủ điều kiện/),
  ).toBeVisible();
});

test("UC03 mobile: QR rotates automatically; background hides QR and stops polling until resume", async ({
  page,
}) => {
  const first = page.waitForResponse((r) =>
    r.url().endsWith("/api/check-ins/qr"),
  );
  await login(page);
  const initial = await (await first).json();
  await expect(page.getByTestId("checkin-qr")).toBeVisible();
  const next = await page.waitForResponse(
    async (r) =>
      r.url().endsWith("/api/check-ins/qr") &&
      (await r.json()).id !== initial.id,
    { timeout: 25000 },
  );
  expect((await next.json()).payload).not.toBe(initial.payload);
  let polls = 0;
  page.on("request", (r) => {
    if (/\/api\/check-ins\/qr\/.*\/status$/.test(r.url())) polls++;
  });
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByTestId("checkin-qr")).toHaveCount(0);
  const count = polls;
  await page.waitForTimeout(2400);
  expect(polls).toBe(count);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByTestId("checkin-qr")).toBeVisible();
});
