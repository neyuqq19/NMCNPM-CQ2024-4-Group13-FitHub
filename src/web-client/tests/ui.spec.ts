import { test, expect, type Page } from "@playwright/test";
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
async function create(page: Page, label: string) {
  await page.getByRole("link", { name: "Thêm hội viên", exact: true }).click();
  const email = `uc04-e2e-${crypto.randomUUID()}@example.com`;
  await page.getByLabel("Họ và tên *").fill(`Hội viên ${label}`);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Tạo hồ sơ", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: `Hội viên ${label}`, exact: true }),
  ).toBeVisible();
  return email;
}
test("UC04: create, reload, edit, cancel and deactivate with server persistence", async ({
  page,
}) => {
  await login(page);
  const email = await create(page, "kiểm thử");
  const detail = page.url();
  await expect(
    page
      .getByRole("region", { name: "Hồ sơ hội viên", exact: true })
      .getByText("Chờ xác minh", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await page
    .getByRole("link", { name: "Chỉnh sửa hồ sơ", exact: true })
    .click();
  await expect(page.getByLabel("Email", { exact: true })).toHaveAttribute(
    "readonly",
    "",
  );
  await page.getByLabel("Chiều cao (cm)", { exact: true }).fill("175");
  await page
    .getByLabel("Tiền sử chấn thương", { exact: true })
    .fill("Chưa từng khai báo trước đây");
  await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await expect(
    page.getByText("Cập nhật hồ sơ hội viên thành công."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Ngừng sử dụng", exact: true })
    .click();
  await page.getByRole("button", { name: "Hủy", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Hồ sơ hội viên", exact: true })
      .getByText("Chờ xác minh", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Ngừng sử dụng", exact: true })
    .click();
  await page.getByLabel("Lý do ngừng sử dụng *").fill("Khách yêu cầu dừng");
  await page
    .getByRole("button", { name: "Xác nhận ngừng sử dụng", exact: true })
    .click();
  await expect(
    page.getByText(
      "Hồ sơ đã ngừng sử dụng. Chỉ được xem; lịch sử vẫn được bảo toàn.",
    ),
  ).toBeVisible();
  await page.goto(detail);
  await expect(page.getByText("Ngừng sử dụng", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Chỉnh sửa hồ sơ" })).toHaveCount(
    0,
  );
});
test("UC04: field errors, duplicate contact, search/filter/empty list", async ({
  page,
}) => {
  await login(page);
  const email = await create(page, "tra cứu");
  await page.goto("/#/members/new");
  await page.getByLabel("Họ và tên *").fill("Trùng");
  await page.getByRole("button", { name: "Tạo hồ sơ", exact: true }).click();
  await expect(
    page.getByLabel("Số điện thoại", { exact: true }),
  ).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Tạo hồ sơ", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Mở hồ sơ đã có" }),
  ).toBeVisible();
  await page.goto("/#/members");
  await page
    .getByRole("textbox", { name: "Tìm kiếm", exact: true })
    .fill(email);
  await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page
    .getByRole("combobox", { name: "Trạng thái tài khoản", exact: true })
    .selectOption("DEACTIVATED");
  await expect(
    page.getByText("Không tìm thấy hội viên", { exact: true }),
  ).toBeVisible();
});
test("UC04: stale version requires reload, network failure retains input, expiry returns login", async ({
  page,
  request,
}) => {
  await login(page);
  await create(page, "xung đột");
  const id = page.url().split("/members/")[1].split("?")[0];
  const token = await page.evaluate(() =>
    sessionStorage.getItem("fithub_token"),
  );
  await page
    .getByRole("link", { name: "Chỉnh sửa hồ sơ", exact: true })
    .click();
  const external = await request.patch(`${api}/api/members/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { displayName: "Bản mới", version: 0 },
  });
  expect(external.ok()).toBeTruthy();
  await page.getByLabel("Địa chỉ", { exact: true }).fill("Giữ nội dung");
  await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Hồ sơ đã thay đổi");
  await expect(page.getByLabel("Địa chỉ", { exact: true })).toHaveValue(
    "Giữ nội dung",
  );
  await page
    .getByRole("button", { name: "Tải lại bản mới (bỏ thay đổi chưa lưu)" })
    .click();
  await expect(page.getByLabel("Họ và tên *")).toHaveValue("Bản mới");
  await page.route("**/api/members/*", (route) =>
    route.request().method() === "PATCH" ? route.abort() : route.continue(),
  );
  await page.getByLabel("Địa chỉ", { exact: true }).fill("Không mất dữ liệu");
  await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Không kết nối");
  await expect(page.getByLabel("Địa chỉ", { exact: true })).toHaveValue(
    "Không mất dữ liệu",
  );
  await page.unroute("**/api/members/*");
  await request.post(`${api}/api/auth/logout`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Đăng nhập", exact: true }),
  ).toBeVisible();
});
test("UC04: small viewport, missing profile and real transaction history", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto("/#/members/00000000-0000-4000-8000-000000000000");
  await expect(
    page.getByRole("heading", { name: "Không tìm thấy hội viên" }),
  ).toBeVisible();
  await page.goto("/#/members?pageSize=1");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "Trang sau", exact: true }).click();
  await expect(page.getByText(/Trang 2 \/ /)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.goto("/#/history");
  await expect(page.getByText(/Bản xem thử: số liệu tổng quan/)).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Lịch sử thanh toán" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Đăng nhập", exact: true }),
  ).toBeVisible();
});

test("UC04: desktop list and form visual verification", async ({ page }) => {
  await login(page);
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await page.screenshot({
    path: "test-results/uc04-members-desktop.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Thêm hội viên", exact: true }).click();
  await expect(page.getByLabel("Họ và tên *")).toBeVisible();
  await page.screenshot({
    path: "test-results/uc04-member-form.png",
    fullPage: true,
  });
});

test("UC04: live search, per-row view/edit and real purchase history", async ({
  page,
}) => {
  await login(page);
  await page.goto("/#/members?page=2&pageSize=1");
  const search = page.getByRole("textbox", { name: "Tìm kiếm", exact: true });
  await search.fill("hoang nam");
  await expect(page).toHaveURL(/q=hoang/);
  await expect(page.getByText(/Trang 1 \/ /)).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  const row = page.locator("tbody tr");
  await expect(row).toContainText("Trần Hoàng Nam");
  await row
    .getByRole("link", { name: "Chỉnh sửa Trần Hoàng Nam", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Chỉnh sửa hồ sơ", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Họ và tên *")).toHaveValue("Trần Hoàng Nam");
  await page.getByRole("link", { name: "Hủy", exact: true }).click();
  const history = page.getByRole("table", {
    name: "Lịch sử mua gói tập",
    exact: true,
  });
  await expect(history).toContainText("Gym 3 tháng");
  await expect(history).toContainText("Đã thanh toán");
  await expect(history).toContainText("Tiền mặt");
  await page.reload();
  await expect(history).toContainText("Đã thanh toán");
  await page.screenshot({
    path: "test-results/uc04-member-history.png",
    fullPage: true,
  });
  await page.goto("/#/members");
  await page
    .getByRole("textbox", { name: "Tìm kiếm", exact: true })
    .fill("0902345678");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page
    .getByRole("link", { name: "Xem chi tiết Trần Hoàng Nam", exact: true })
    .click();
  await expect(history).toContainText("Đã thanh toán");
  await page.goto("/#/members");
  await page
    .getByRole("textbox", { name: "Tìm kiếm", exact: true })
    .fill("not-found-live-search");
  await expect(
    page.getByText("Không tìm thấy hội viên", { exact: true }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Tìm kiếm", exact: true }).fill("");
  await expect(page.locator("tbody tr").first()).toBeVisible();
});

test("UC04: global overview stays unfiltered and compact profile shows spending", async ({
  page,
  request,
}) => {
  await login(page);
  const token = await page.evaluate(() =>
    sessionStorage.getItem("fithub_token"),
  );
  const overviewResponse = await request.get(`${api}/api/members/overview`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(overviewResponse.ok()).toBeTruthy();
  const overview = await overviewResponse.json();
  const cards = page.getByRole("region", {
    name: "Tổng quan hội viên",
    exact: true,
  });
  await expect(cards.locator("strong").first()).toHaveText(
    String(overview.total),
  );
  await page
    .getByRole("textbox", { name: "Tìm kiếm", exact: true })
    .fill("0902345678");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(cards.locator("strong").first()).toHaveText(
    String(overview.total),
  );
  await page
    .getByRole("link", { name: "Xem chi tiết Trần Hoàng Nam", exact: true })
    .click();
  const profile = page.getByRole("region", {
    name: "Hồ sơ hội viên",
    exact: true,
  });
  await expect(
    profile.getByRole("heading", { name: "Trần Hoàng Nam", exact: true }),
  ).toBeVisible();
  await expect(
    profile.getByText("Tổng tiền mua gói", { exact: true }),
  ).toBeVisible();
  await expect(
    profile.locator("dd").filter({ hasText: "1.350.000" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/uc04-profile-overview.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/uc04-profile-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
