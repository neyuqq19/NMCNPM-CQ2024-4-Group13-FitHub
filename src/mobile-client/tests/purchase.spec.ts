import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { checkInFixture } from "../../backend/test/check-in-fixture";

async function setup(page: Page, paid = false) {
  const f = await checkInFixture(paid);
  const db = new PrismaClient();
  const pack = await db.package.create({
    data: {
      code: "MOBILE-" + randomUUID(),
      name: "Gói mobile " + randomUUID().slice(0, 6),
      durationMonths: 1,
      price: 123000,
      ptSessionsIncluded: 5,
      grantsGymAccess: true,
      isActive: true,
    },
  });
  await page.goto("/");
  await page
    .getByLabel("Email hoặc số điện thoại", { exact: true })
    .fill(f.email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(f.password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.getByText("GÓI TẬP HIỆN TẠI", { exact: true }).click();
  await page.getByText("Gia hạn", { exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Đăng ký & gia hạn" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Xem thêm .* gói tập/ }).click();
  await page
    .getByRole("button", { name: `Chọn gói ${pack.name}`, exact: true })
    .click();
  return { f, pack, db };
}
async function confirm(page: Page) {
  await page
    .getByRole("button", { name: "Tiếp tục  →", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Xem lại đăng ký", exact: true }),
  ).toBeVisible();
  const [res] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/memberships/register") &&
        r.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Tiếp tục thanh toán  →", exact: true }).click(),
  ]);
  expect(res.status()).toBe(201);
  return res.json();
}

test("Mobile purchase: confirm, failed payment retry, backend activation and invoice", async ({
  page,
}) => {
  const { f, db } = await setup(page);
  try {
    await page
      .getByRole("button", { name: "Tiếp tục  →", exact: true })
      .click();
    await page.screenshot({ path: "../.local/mobile-purchase-confirm.png" });
    expect(await db.membership.count({ where: { memberId: f.memberId } })).toBe(
      0,
    );
    await page.getByRole("button", { name: "Đổi gói tập", exact: true }).click();
    const order = await confirm(page);
    expect(order.status).toBe("PENDING");
    expect(order.membership.status).toBe("PENDING_PAYMENT");
    await expect(
      page.getByText("Chờ thanh toán", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Thanh toán qua VNPay", exact: true })
      .click();
    await expect(
      page.getByText("Thanh toán mô phỏng", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Thanh toán thử thất bại", exact: true })
      .click();
    await expect(
      page.getByText("Thanh toán chưa thành công", { exact: true }),
    ).toBeVisible();
    expect(
      (
        await db.membership.findUniqueOrThrow({
          where: { id: order.membership.id },
        })
      ).status,
    ).toBe("PENDING_PAYMENT");
    await page
      .getByRole("button", { name: "Thử lại thanh toán VNPay", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Thanh toán thử thành công", exact: true })
      .click();
    await expect(
      page.getByText("Đã thanh toán và cấp quyền sử dụng gói.", {
        exact: true,
      }),
    ).toBeVisible();
    const payment = await db.payment.findUniqueOrThrow({
      where: { id: order.id },
      include: { membership: true, invoice: true },
    });
    expect(payment.status).toBe("CONFIRMED");
    expect(payment.membership.status).toBe("ACTIVE");
    expect(payment.invoice?.status).toBe("ISSUED");
    expect(await db.membership.count({ where: { memberId: f.memberId } })).toBe(
      1,
    );
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
      if (width === 390)
        await page.screenshot({ path: "../.local/mobile-purchase-paid.png" });
    }
    await page
      .getByRole("button", { name: "Gói tập", exact: true })
      .click();
    await page.getByText("Gia hạn", { exact: true }).click();
    await page.getByRole("button", { name: /Xem lịch sử giao dịch/ }).click();
    await page.getByRole("button", { name: new RegExp(order.code) }).click();
    await expect(
      page.getByText("Đã xác nhận thanh toán", { exact: true }),
    ).toBeVisible();
  } finally {
    await db.$disconnect();
  }
});

test("Mobile purchase: lost creation response is recoverable via own history and cancellation", async ({
  page,
}) => {
  const { f, db } = await setup(page);
  try {
    let saved: any;
    await page.route("**/api/memberships/register", async (route) => {
      const res = await route.fetch();
      saved = await res.json();
      await route.abort("failed");
    });
    await page
      .getByRole("button", { name: "Tiếp tục  →", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Tiếp tục thanh toán  →", exact: true })
      .click();
    await page.getByRole("button", { name: /Xem lịch sử giao dịch/ }).click();
    await expect(
      page.getByRole("button", { name: new RegExp("GD.*Chờ thanh toán") }),
    ).toBeVisible();
    expect(saved.status).toBe("PENDING");
    expect(await db.membership.count({ where: { memberId: f.memberId } })).toBe(
      1,
    );
    await page.unroute("**/api/memberships/register");
    await page.getByRole("button", { name: new RegExp(saved.code) }).click();
    await page
      .getByRole("button", { name: "Hủy đơn chưa thanh toán", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Xác nhận hủy đơn", exact: true })
      .click();
    await expect(page.getByText("Đã hủy", { exact: true })).toBeVisible();
    expect(
      (
        await db.membership.findUniqueOrThrow({
          where: { id: saved.membership.id },
        })
      ).status,
    ).toBe("CANCELLED");
    await page.getByRole("button", { name: "Quay lại gói của tôi", exact: true }).click();
    const fresh = await confirm(page);
    expect(fresh.id).not.toBe(saved.id);
  } finally {
    await db.$disconnect();
  }
});

test("Mobile renewal: starts after current paid term and becomes scheduled", async ({
  page,
}) => {
  const { f, db } = await setup(page, true);
  try {
    const current = await db.membership.findFirstOrThrow({
      where: { memberId: f.memberId, status: "ACTIVE" },
    });
    const order = await confirm(page);
    expect(order.membership.startsOn).toBe(
      current.endsBefore.toISOString().slice(0, 10),
    );
    await page
      .getByRole("button", { name: "Thanh toán qua VNPay", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Thanh toán thử thành công", exact: true })
      .click();
    await expect(
      page.getByText(/Đã thanh toán\. Gói sẽ bắt đầu từ/),
    ).toBeVisible();
    expect(
      (
        await db.membership.findUniqueOrThrow({
          where: { id: order.membership.id },
        })
      ).status,
    ).toBe("SCHEDULED");
    expect(
      (await db.membership.findUniqueOrThrow({ where: { id: current.id } }))
        .status,
    ).toBe("ACTIVE");
  } finally {
    await db.$disconnect();
  }
});
