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
  const bioField = page.getByLabel("Giới thiệu bản thân");
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
    const avatar = page.getByLabel("Đường dẫn ảnh đại diện");
    await avatar.fill("ftp://example.test/anh.png");
    await expect(
      page.getByText("Đường dẫn ảnh phải dùng HTTP hoặc HTTPS."),
    ).toBeVisible();
    const imageUrl = "https://example.test/anh.png";
    await page.route(imageUrl, (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"/>',
      }),
    );
    await avatar.fill(imageUrl);
    await expect(
      page.getByRole("img", {
        name: `Ảnh đại diện của ${original.displayName}`,
      }),
    ).toBeVisible();
    await page.route("https://example.test/missing.png", (route) =>
      route.abort(),
    );
    await avatar.fill("https://example.test/missing.png");
    await expect(
      page.getByText("Không tải được ảnh. Vui lòng kiểm tra đường dẫn."),
    ).toBeVisible();
    await avatar.fill(original.avatarUrl || "");
    await bioField.focus();
    await expect(bioField).toHaveCSS("color", "rgb(23, 32, 51)");
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

    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole("button", { name: "Thêm chuyên môn" }).click();
    const newIndex = original.specialties.length + 1;
    const newSpecialty = page.getByLabel(`Chuyên môn ${newIndex}`, {
      exact: true,
    });
    const remove = page.getByRole("button", {
      name: `Xóa chuyên môn ${newIndex}`,
      exact: true,
    });
    const inputBox = await newSpecialty.boundingBox();
    const removeBox = await remove.boundingBox();
    expect(inputBox!.x + inputBox!.width).toBeLessThanOrEqual(removeBox!.x);
    expect(removeBox!.x + removeBox!.width).toBeLessThanOrEqual(375);
    await remove.click();
    await expect(newSpecialty).toHaveCount(0);
    await page.setViewportSize({ width: 1280, height: 960 });

    await years.fill("7");
    await page.getByLabel("Trạng thái làm việc").selectOption("ON_LEAVE");
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
    await page.getByLabel("Ngày cấp", { exact: true }).fill("01/01/2999");
    await page.getByRole("button", { name: "Thêm chứng chỉ" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "Ngày cấp chứng chỉ không được vượt quá ngày hiện tại",
    );
    await page.getByLabel("Ngày cấp", { exact: true }).fill("10/05/2024");
    await page.getByRole("button", { name: "Thêm chứng chỉ" }).click();
    await expect(page.getByText(credentials, { exact: true })).toBeVisible();
    const certRow = page.getByRole("row").filter({ hasText: credentials });
    await expect(certRow.getByText("10/05/2024")).toBeVisible();
    await certRow.getByRole("button", { name: /Sửa chứng chỉ/ }).click();
    const certName = page.getByLabel("Tên chứng chỉ", { exact: true });
    await expect(certName).toHaveValue("NASM CPT");
    await certName.fill("NASM CPT nâng cao");
    await page.getByLabel("Ngày cấp", { exact: true }).fill("12/06/2024");
    await page.getByRole("button", { name: "Lưu chứng chỉ" }).click();
    await expect(certRow.getByText("NASM CPT nâng cao")).toBeVisible();
    await expect(certRow.getByText("12/06/2024")).toBeVisible();
    await page.reload();
    await expect(bioField).toHaveValue(bio);
    await expect(page.getByLabel("Trạng thái làm việc")).toHaveValue(
      "ON_LEAVE",
    );
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
    await expect(stale.getByLabel("Giới thiệu bản thân")).toHaveValue(bio);
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
          workStatus: original.workStatus,
          avatarUrl: original.avatarUrl,
          version,
        },
      });
      expect(restored.ok()).toBe(true);
    }
  }
});
