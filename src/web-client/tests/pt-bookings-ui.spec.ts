import { expect, test, type Page } from "@playwright/test";
import type { AppointmentDto } from "@fithub/contracts";

const fixedNow = new Date("2030-05-15T02:00:00Z");

async function openCancellation(page: Page, minutesUntilStart = 361) {
  await page.goto("/#/login");
  await page.getByLabel("Email hoặc số điện thoại").fill("admin@fithub.vn");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("FitHubDemo!2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByRole("link", { name: "Lịch hẹn PT" })).toBeVisible();
  await page.clock.install({ time: fixedNow });
  await page.clock.pauseAt(fixedNow);
  const appointment: AppointmentDto = {
    id: "00000000-0000-4000-8000-000000000001",
    code: "LH-UI-TEST",
    status: "CONFIRMED",
    ptSessionState: "HELD",
    slotId: "00000000-0000-4000-8000-000000000002",
    workDate: "2030-05-15",
    startTime: new Date(+fixedNow + minutesUntilStart * 60_000).toISOString(),
    endTime: new Date(+fixedNow + (minutesUntilStart + 60) * 60_000).toISOString(),
    trainer: { id: "pt", displayName: "PT Test", trainerCode: "PTTEST" },
    member: { id: "member", displayName: "Member Test", memberCode: "HVTEST" },
    compensationGranted: false,
    cancelReason: null,
    cancelledAt: null,
    createdAt: fixedNow.toISOString(),
  };
  await page.route("**/api/appointments", route =>
    route.fulfill({ json: { items: [appointment], total: 1 } }),
  );
  await page.getByRole("link", { name: "Lịch hẹn PT" }).click();
  await page.getByRole("button", { name: "PT hủy lịch", exact: true }).click();
  return page.getByRole("dialog");
}

test("UC08: cancellation warning changes across 6h without user interaction", async ({ page }) => {
  const dialog = await openCancellation(page);
  const refundOnly = dialog.getByText("Hội viên sẽ được hoàn lại 1 buổi PT.", { exact: true });
  await expect(refundOnly).toBeVisible();
  await page.clock.fastForward(60_000);
  // At exactly 6h there is no compensation.
  await expect(refundOnly).toBeVisible();
  await page.clock.fastForward(1000);
  await expect(dialog.getByText(/đền bù thêm \+1 buổi PT/)).toBeVisible();
  await expect(refundOnly).toHaveCount(0);
  await page.screenshot({ path: "test-results/pt-warning-updated.png", fullPage: true });
});

test("UC08: cancellation errors stay inside the dialog and clear on reopening", async ({ page }) => {
  const dialog = await openCancellation(page);
  const confirm = dialog.getByRole("button", { name: "Xác nhận hủy lịch" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Lý do hủy (bắt buộc)").fill("PT bận đột xuất");
  await page.route("**/api/appointments/*/cancel-by-pt", route =>
    route.fulfill({ status: 409, json: { code: "APPOINTMENT_NOT_CONFIRMED", message: "Lịch hẹn đã thay đổi. Vui lòng kiểm tra lại." } }),
  );
  await confirm.click();
  await expect(dialog.getByRole("alert")).toHaveText(/Lịch hẹn đã thay đổi/);
  await expect(dialog.getByLabel("Lý do hủy (bắt buộc)")).toHaveValue("PT bận đột xuất");
  await expect(confirm).toBeEnabled();
  await page.screenshot({ path: "test-results/pt-error-in-dialog.png", fullPage: true });
  await dialog.getByRole("button", { name: "Đóng", exact: true }).click();
  await expect(page.getByText(/Lịch hẹn đã thay đổi/)).toHaveCount(0);
  await page.getByRole("button", { name: "PT hủy lịch", exact: true }).click();
  await expect(dialog.getByLabel("Lý do hủy (bắt buộc)")).toHaveValue("");
  await expect(confirm).toBeDisabled();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
});

test("UC08: an open cancellation dialog stops allowing cancellation when the session starts", async ({ page }) => {
  const dialog = await openCancellation(page, 1);
  await dialog.getByLabel("Lý do hủy (bắt buộc)").fill("PT bận");
  await expect(dialog.getByRole("button", { name: "Xác nhận hủy lịch" })).toBeEnabled();
  await page.clock.fastForward(60_000);
  await expect(dialog.getByRole("alert")).toHaveText(/Buổi tập đã bắt đầu/);
  await expect(dialog.getByRole("button", { name: "Xác nhận hủy lịch" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "PT hủy lịch", exact: true })).toHaveCount(0);
});
