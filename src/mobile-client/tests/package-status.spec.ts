import { test, expect } from "@playwright/test";
import { checkInFixture } from "../../backend/test/check-in-fixture";

const cases = [
  ["ACTIVE", "Thông tin gia hạn gói", "NGÀY KẾT THÚC"],
  ["PENDING_PAYMENT", "Gói tập chờ thanh toán", "CHỜ THANH TOÁN"],
  ["SCHEDULED", "Gói tập chưa đến ngày bắt đầu", "NGÀY BẮT ĐẦU"],
  ["FROZEN", "Gói tập đang bảo lưu", "ĐANG BẢO LƯU"],
  ["CANCELLED", "Gói tập đã hủy", "ĐÃ HỦY"],
  ["EXPIRED", "Gói tập đã hết hạn", "ĐÃ KẾT THÚC"],
  ["NONE", "Chưa có gói tập", "CHƯA CÓ GÓI"],
];
for (const [state] of cases) {
  test(`Package information: ${state}`, async ({ page }) => {
    const f = await checkInFixture(false);
    await page.route("**/api/auth/membership", r => r.fulfill({ json: {
      state, memberCode: "HV-UI", membershipCode: "DK-UI", packageName: "Gói giao diện", startsOn: "01/12/2026", endsInclusive: "31/12/2026", daysRemaining: state === "ACTIVE" ? 10 : 0, totalDays: 31,
    } }));
    await page.route("**/api/memberships/my/detail", r => r.fulfill({ json: {
      hasProfile: true, memberCode: "HV-UI", activeMembership: state === "NONE" ? null : {
        id: "ui-membership", code: "DK-UI", status: state, packageName: "Gói giao diện", startsOn: "2026-12-01", endsBefore: "2027-01-01", durationMonths: 1, ptSessionsRemaining: 0, frozenDaysUsed: 0, freezePeriods: [],
      }, scheduledMembership: null, recentMemberships: [],
    } }));
    await page.goto("/");
    await page.getByLabel("Email hoặc số điện thoại", { exact: true }).fill(f.email);
    await page.getByLabel("Mật khẩu", { exact: true }).fill(f.password);
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    const labels: Record<string, string> = { ACTIVE: "Đang hoạt động", PENDING_PAYMENT: "Chờ thanh toán", SCHEDULED: "Chưa đến ngày", FROZEN: "Đang bảo lưu", CANCELLED: "Đã hủy", EXPIRED: "Đã hết hạn", NONE: "Chưa có gói" };
    await expect(page.getByText(labels[state], { exact: true })).toBeVisible();
    await page.getByText("GÓI TẬP HIỆN TẠI", { exact: true }).click();
    await expect(page.getByText("Gói tập của tôi", {exact:true})).toBeVisible();
    await expect(page.getByText("Không hỗ trợ bảo lưu", {exact:true})).toBeVisible();
    await expect(page.getByText(/^\d+%$/)).toHaveCount(0);
    await expect(page.getByText("Bảo lưu gói tập (7 ngày)", {exact:true})).toHaveCount(0);
    await page.getByText("Gia hạn", {exact:true}).click();
    await expect(page.getByRole("heading", {name:"Đăng ký & gia hạn", exact:true})).toBeVisible();
  });
}
