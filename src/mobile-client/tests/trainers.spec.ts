import { expect, test } from "@playwright/test";
import { checkInFixture } from "../../backend/test/check-in-fixture";

const tomorrow = new Date(Date.now() + 31 * 3600_000)
  .toISOString()
  .slice(0, 10);
const trainer = {
  id: "trainer-ui",
  userId: "trainer-user",
  trainerCode: "PT-UI",
  displayName: "Huấn luyện viên mẫu",
  specialties: ["Tăng cơ", "Phục hồi"],
  experienceYears: 5,
  certificationCount: 1,
  avatarUrl: null,
  workStatus: "ACTIVE",
  accountStatus: "ACTIVE",
  email: null,
  phone: null,
};
const slot = {
  id: "slot-ui",
  workDate: tomorrow,
  startTime: `${tomorrow}T01:00:00Z`,
  endTime: `${tomorrow}T02:00:00Z`,
  status: "OPEN",
  member: null,
  unavailableReason: null,
};
const appointment = {
  ...slot,
  id: "appointment-ui",
  code: "LH-UI",
  status: "CONFIRMED",
  ptSessionState: "HELD",
  slotId: slot.id,
  member: { id: "member-ui", displayName: "Hội viên", memberCode: "HV-UI" },
  trainer,
  compensationGranted: false,
  cancelReason: null,
  cancelledAt: null,
  createdAt: new Date().toISOString(),
};

test("PT cards, search, confirmation, appointment groups and responsive layout", async ({
  page,
}) => {
  const member = await checkInFixture(false);
  let posts = 0;
  let saved = false;
  let previewUnavailable = false;
  await page.route("**/api/trainers**", async (r) => {
    if (r.request().url().includes("available-slots"))
      return r.fulfill({ json: saved ? [] : [slot] });
    if (r.request().url().includes("/trainer-ui"))
      return r.fulfill({
        json: {
          ...trainer,
          bio: "Hướng dẫn tập luyện an toàn.",
          version: 1,
          certifications: [
            {
              id: "cert",
              name: "Certified Personal Trainer",
              issuer: "ACE",
              issuedAt: "2023-05-10",
              credentialUrl: null,
            },
          ],
        },
      });
    return r.fulfill({
      json: {
        items: [{ ...trainer, nextAvailableSlots: saved ? [] : [slot] }],
      },
    });
  });
  await page.route("**/api/appointments**", async (r) => {
    const url = r.request().url();
    if (url.includes("booking-preview") && previewUnavailable)
      return r.fulfill({ status: 409, json: { code: "SLOT_UNAVAILABLE", message: "Ca này vừa có người đặt." } });
    if (url.includes("booking-preview"))
      return r.fulfill({
        json: {
          membership: {
            id: "m",
            packageName: "Gym + PT",
            ptSessionsRemaining: 3,
            endsBefore: "2030-01-01",
          },
        },
      });
    if (r.request().method() === "POST") {
      posts++;
      saved = true;
      return r.fulfill({
        status: 201,
        json: { appointment, ptAvailable: 2, ptSessionOutcome: null },
      });
    }
    return r.fulfill({
      json: {
        ptAvailable: saved ? 2 : 3,
        total: 3,
        items: [
          ...(saved ? [appointment] : []),
          {
            ...appointment,
            id: "cancelled",
            code: "LH-CANCELLED",
            status: "CANCELLED_BY_PT",
            compensationGranted: true,
          },
          {
            ...appointment,
            id: "completed",
            code: "LH-COMPLETED",
            status: "COMPLETED",
          },
          {
            ...appointment,
            id: "past",
            code: "LH-AWAITING",
            startTime: "2020-01-01T01:00:00Z",
            endTime: "2020-01-01T02:00:00Z",
          },
        ],
      },
    });
  });
  await page.goto("/");
  await page
    .getByLabel("Email hoặc số điện thoại", { exact: true })
    .fill(member.email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(member.password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.getByRole("button", { name: "Tìm huấn luyện viên" }).click();
  const profile = page.getByRole("button", {
    name: "Xem hồ sơ & đặt lịch · Huấn luyện viên mẫu",
    exact: true,
  });
  await expect(profile).toBeVisible();
  await expect(page.getByText("LH-CANCELLED", { exact: false })).toHaveCount(0);
  await page.getByLabel("Tên huấn luyện viên").fill("không tồn tại");
  await expect(
    page.getByText("Không tìm thấy huấn luyện viên phù hợp."),
  ).toBeVisible();
  await page.getByLabel("Tên huấn luyện viên").fill("huan luyen");
  await page.getByRole("button", { name: "Tăng cơ", exact: true }).click();
  await expect(profile).toBeVisible();
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "../.local/pt-discovery-mobile.png", fullPage: true });
  await profile.click();
  await expect(
    page.getByText("Certified Personal Trainer", { exact: true }),
  ).toBeVisible();
  // Pick tomorrow in the horizontal day strip.
  const dayText = tomorrow.split("-").reverse().join("/").slice(0, 5);
  await page.getByRole("button").filter({ hasText: dayText }).last().click();
  await page
    .getByRole("button", { name: "08:00 – 09:00", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Xác nhận đặt lịch", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Gói dự kiến: Gym + PT")).toBeVisible();
  await page.waitForTimeout(350); // Let the native modal fade settle before visual capture.
  await page.screenshot({ path: "../.local/pt-confirmation-mobile.png" });
  expect(posts).toBe(0);
  await page.getByRole("button", { name: "Chọn lại", exact: true }).click();
  expect(posts).toBe(0);
  previewUnavailable = true;
  await page
    .getByRole("button", { name: "08:00 – 09:00", exact: true })
    .click();
  await expect(page.getByText("Ca này vừa có người đặt.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Xác nhận đặt lịch", exact: true })).toBeDisabled();
  previewUnavailable = false;
  await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await page.getByRole("button", { name: "Xác nhận đặt lịch", exact: true }).click();
  await expect(page.getByText(/Đặt lịch thành công/)).toBeVisible();
  expect(posts).toBe(1);
  await page.getByRole("button", { name: "Đóng hồ sơ", exact: true }).click();
  await expect(
    page.getByText("2 buổi PT còn lại", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Xem tất cả", exact: true }).click();
  await expect(
    page.getByText("LH-AWAITING · Chờ xác nhận kết quả"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Đã hủy", exact: true }).click();
  await expect(page.getByText("LH-CANCELLED · PT đã hủy")).toBeVisible();
  await expect(
    page.getByText("Đã hoàn 1 buổi và đền bù thêm 1 buổi"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Đã hoàn thành", exact: true })
    .click();
  await expect(page.getByText("LH-COMPLETED · Đã hoàn thành")).toBeVisible();
  await expect(
    page.getByText("LH-AWAITING · Chờ xác nhận kết quả"),
  ).toHaveCount(0);
});
