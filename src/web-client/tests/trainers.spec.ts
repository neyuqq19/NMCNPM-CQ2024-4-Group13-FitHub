import { test, expect, type Page } from "@playwright/test";
import type { TrainerProfileDto } from "@fithub/contracts";

async function login(page: Page, identifier: string) {
  await page.goto("/#/login");
  await page
    .getByLabel("Email hoặc số điện thoại", { exact: true })
    .fill(identifier);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("FitHubDemo!2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
}

test("UC06: trainer edits and validates their profile, admin browses the persisted result", async ({
  page,
  context,
}) => {
  test.slow();
  const loaded = page.waitForResponse(
    (r) => r.url().endsWith("/api/trainers/me") && r.ok(),
  );
  await login(page, "trainer@fithub.vn");
  const response = await loaded;
  const original: TrainerProfileDto = await response.json();
  const profileApi = response.url();
  const token = await page.evaluate(() =>
    sessionStorage.getItem("fithub_token"),
  );
  const headers = { Authorization: `Bearer ${token}` };
  const stamp = Date.now();
  const bio = `Huấn luyện thể lực và phục hồi • ${stamp}`;
  const specialty = `Sức bền ${stamp}`;
  const credentials = `NASM-${stamp}`;
  const save = page.getByRole("button", { name: "Lưu hồ sơ" });
  const bioField = page.getByLabel("Tiểu sử chuyên môn");
  const years = page.getByLabel("Số năm kinh nghiệm");
  try {
    await expect(
      page.getByRole("link", { name: "Hội viên", exact: true }),
    ).toHaveCount(0);
    await page.goto("/#/members");
    await expect(
      page.getByRole("heading", { name: "Không tìm thấy trang" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Lịch làm việc PT" }).click();
    await expect(
      page.getByRole("heading", { name: "Lịch làm việc PT" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Hồ sơ chuyên môn" }).click();
    for (const [invalidBio, invalidYears] of [
      [" ", "5"],
      [bio, "-1"],
    ]) {
      await bioField.fill(invalidBio);
      await years.fill(invalidYears);
      const invalid = page.waitForResponse((r) =>
        r.url().endsWith("/me/profile"),
      );
      await save.click();
      expect((await invalid).status()).toBe(400);
      await expect(page.getByRole("alert")).toBeVisible();
    }

    await years.fill("7");
    await page.getByRole("button", { name: "Thêm chuyên môn" }).click();
    await page
      .getByLabel(`Chuyên môn ${original.specialties.length + 1}`, {
        exact: true,
      })
      .fill(specialty);
    const changed = page.waitForResponse((r) =>
      r.url().endsWith("/me/profile"),
    );
    await save.click();
    expect((await (await changed).json()).version).toBe(original.version + 1);
    await expect(page.getByText("Đã lưu hồ sơ chuyên môn.")).toBeVisible();

    await page.getByLabel("Tên chứng chỉ", { exact: true }).fill("NASM CPT");
    await page.getByLabel("Tổ chức cấp", { exact: true }).fill("NASM");
    await page.getByLabel("Mã hoặc đường dẫn minh chứng").fill(credentials);
    await page.getByLabel("Ngày cấp", { exact: true }).fill("2999-01-01");
    await page.getByRole("button", { name: "Thêm chứng chỉ" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "Ngày cấp chứng chỉ không được vượt quá ngày hiện tại",
    );
    await page.getByLabel("Ngày cấp", { exact: true }).fill("2024-05-10");
    await page.getByRole("button", { name: "Thêm chứng chỉ" }).click();
    await expect(page.getByText(credentials, { exact: true })).toBeVisible();
    await page.reload();
    await expect(bioField).toHaveValue(bio);
    await expect(page.getByText(credentials, { exact: true })).toBeVisible();

    const admin = await context.newPage();
    await login(admin, "admin@fithub.vn");
    await admin
      .getByRole("link", { name: "Huấn luyện viên", exact: true })
      .click();
    await admin.getByLabel("Tên huấn luyện viên").fill(original.displayName);
    await admin.getByLabel("Chuyên môn", { exact: true }).fill(specialty);
    await admin.getByRole("button", { name: "Tìm kiếm" }).click();
    await expect(admin.locator("tbody tr")).toHaveCount(1);
    await admin
      .getByRole("link", { name: original.displayName, exact: true })
      .click();
    await expect(admin.getByText(bio, { exact: true })).toBeVisible();
    await expect(admin.getByText(credentials, { exact: true })).toBeVisible();
    await expect(
      admin.getByRole("button", { name: /Lưu hồ sơ|Thêm chứng chỉ|Xóa/ }),
    ).toHaveCount(0);

    // Two tabs opened at the same version. The second must explicitly load the new version.
    const popup = page.waitForEvent("popup");
    await page.evaluate(() => {
      window.open(window.location.href, "_blank");
    });
    const stale = await popup;
    await expect(stale.getByLabel("Tiểu sử chuyên môn")).toHaveValue(bio);
    await page
      .getByRole("row")
      .filter({ hasText: credentials })
      .getByRole("button", { name: /Xóa/ })
      .click();
    await expect(page.getByText("Đã xóa chứng chỉ.")).toBeVisible();
    await stale.getByRole("button", { name: "Lưu hồ sơ" }).click();
    await stale.getByRole("button", { name: "Tải lại hồ sơ" }).click();
    await expect(
      stale.getByRole("button", { name: "Lưu hồ sơ" }),
    ).toBeEnabled();
    await expect(stale.getByText(credentials, { exact: true })).toHaveCount(0);
  } finally {
    const latest: TrainerProfileDto = await (
      await page.request.get(profileApi, { headers })
    ).json();
    let version = latest.version;
    const added = latest.certifications.find(
      (c) => c.credentialUrl === credentials,
    );
    if (added) {
      const cleanup = await page.request.delete(
        `${profileApi}/certifications/${added.id}`,
        { headers, data: { version } },
      );
      expect(cleanup.ok()).toBe(true);
      version = (await cleanup.json()).version;
    }
    if (latest.bio === bio) {
      const restored = await page.request.put(`${profileApi}/profile`, {
        headers,
        data: {
          bio: original.bio,
          specialties: original.specialties,
          experienceYears: original.experienceYears,
          avatarUrl: original.avatarUrl,
          version,
        },
      });
      expect(restored.ok()).toBe(true);
    }
  }
});
