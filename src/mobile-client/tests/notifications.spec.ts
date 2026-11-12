import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { checkInFixture } from "../../backend/test/check-in-fixture";

// UC16: the bell on Home shows the unread count, the inbox opens, and tapping a
// notification marks it read, lowers the badge and goes to the package screen.
test("Notifications: bell badge, inbox, mark read, contextual navigation", async ({ page }) => {
  const f = await checkInFixture(true);
  const db = new PrismaClient();
  try {
    const user = await db.user.findUniqueOrThrow({ where: { email: f.email } });
    const make = (title: string, type: "PT_REMINDER" | "PACKAGE_EXPIRY", isRead: boolean, ago: number) =>
      db.notification.create({
        data: {
          recipientId: user.id,
          type,
          title,
          body: `${title} - nội dung`,
          targetScreen: type === "PT_REMINDER" ? "PT_APPOINTMENTS" : "MY_PACKAGE",
          isRead,
          readAt: isRead ? new Date() : null,
          createdAt: new Date(Date.now() - ago),
        },
      });
    await make("Nhắc hạn gói 7 ngày", "PACKAGE_EXPIRY", false, 1000);
    await make("Nhắc lịch PT 2 giờ", "PT_REMINDER", false, 2000);
    await make("Nhắc lịch PT 24 giờ", "PT_REMINDER", true, 3000);
  } finally {
    await db.$disconnect();
  }

  await page.goto("/");
  await page.getByLabel("Email hoặc số điện thoại", { exact: true }).fill(f.email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(f.password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByText("GÓI TẬP HIỆN TẠI")).toBeVisible();

  // Badge shows the two unread notifications.
  const badge = page.getByTestId("notification-badge");
  await expect(badge).toHaveText("2");
  await page.getByRole("button", { name: /^Thông báo, 2 chưa đọc/ }).click();

  const inbox = page.getByTestId("notification-inbox");
  await expect(inbox.getByText("2 chưa đọc")).toBeVisible();
  // Newest first.
  const titles = await inbox.getByRole("button", { name: /Nhắc/ }).allTextContents();
  expect(titles[0]).toContain("Nhắc hạn gói 7 ngày");
  expect(titles).toHaveLength(3);

  // Filter by type keeps the unread counter for the whole inbox.
  await page.getByRole("button", { name: "Lịch PT", exact: true }).click();
  await expect(inbox.getByRole("button", { name: /Nhắc lịch PT/ })).toHaveCount(2);
  await expect(inbox.getByText("2 chưa đọc")).toBeVisible();
  await page.getByRole("button", { name: "Tất cả", exact: true }).click();

  // Tapping an unread package reminder marks it read and opens the package screen.
  await inbox.getByRole("button", { name: /Chưa đọc\. Nhắc hạn gói 7 ngày/ }).click();
  await expect(page.getByText("Gói tập của tôi")).toBeVisible();

  // Back on Home the badge went down by one.
  await page.getByRole("button", { name: "Trang chủ", exact: true }).click();
  await expect(page.getByTestId("notification-badge")).toHaveText("1");

  // Mark everything read: the badge disappears.
  await page.getByRole("button", { name: /^Thông báo, 1 chưa đọc/ }).click();
  await page.getByRole("button", { name: "Đánh dấu tất cả đã đọc" }).click();
  await expect(inbox.getByText("Đã đọc hết")).toBeVisible();
  await page.getByRole("button", { name: "Quay lại" }).click();
  await expect(page.getByTestId("notification-badge")).toHaveCount(0);
});
