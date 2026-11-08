import { test, expect, type Page } from "@playwright/test";
import { QRCodeWriter, BarcodeFormat } from "@zxing/library";
import { checkInFixture } from "../../backend/test/check-in-fixture";
const api = "http://127.0.0.1:3101";
async function login(page: Page) {
  await page.goto("/check-in");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("FitHubDemo!2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.getByRole("link", { name: "Check-in", exact: true }).click();
}
async function payload(page: Page) {
  const f = await checkInFixture();
  const response = await page.request.post(`${api}/api/auth/login`, {
    data: {
      identifier: f.email,
      password: f.password,
      platform: "MOBILE",
      deviceId: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
    },
  });
  expect(response.ok()).toBeTruthy();
  const { accessToken } = await response.json();
  const q = await page.request.post(`${api}/api/check-ins/qr`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(q.ok()).toBeTruthy();
  return (await q.json()).payload as string;
}
async function fakeCamera(page: Page, qr: string, small = false) {
  const size = small ? 200 : 480;
  const matrix = new QRCodeWriter().encode(
    qr,
    BarcodeFormat.QR_CODE,
    size,
    size,
    new Map(),
  );
  const rows = Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => (matrix.get(x, y) ? 1 : 0)),
  );
  await page.addInitScript(
    ({ rows, small }) => {
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        value: async (constraints: MediaStreamConstraints) => {
          const debug = window as unknown as {
            cameraCalls: number;
            cameraConstraints: MediaStreamConstraints;
          };
          debug.cameraCalls = (debug.cameraCalls || 0) + 1;
          debug.cameraConstraints = constraints;
          const canvas = document.createElement("canvas");
          canvas.width = small ? 1280 : 480;
          canvas.height = small ? 720 : 480;
          const c = canvas.getContext("2d")!;
          c.fillStyle = "#303038";
          c.fillRect(0, 0, canvas.width, canvas.height);
          const x0 = small ? 540 : 0,
            y0 = small ? 260 : 0;
          c.fillStyle = "white";
          c.fillRect(x0, y0, rows.length, rows.length);
          if (small) c.globalAlpha = 0.7;
          c.fillStyle = "black";
          for (let y = 0; y < rows.length; y++)
            for (let x = 0; x < rows.length; x++)
              if (rows[y][x]) c.fillRect(x + x0, y + y0, 1, 1);
          const stream = canvas.captureStream(10);
          // A real camera emits new frames continuously. Keep this canvas live
          // after video.play(), rather than relying on its initial captured frame.
          const frames = setInterval(() => {
            c.fillStyle = "#303038";
            c.fillRect(0, 0, 1, 1);
          }, 80);
          const track = stream.getVideoTracks()[0],
            stop = track.stop.bind(track);
          track.stop = () => {
            clearInterval(frames);
            stop();
          };
          return stream;
        },
      });
      Object.defineProperty(navigator.mediaDevices, "enumerateDevices", {
        value: async () => [
          {
            kind: "videoinput",
            deviceId: "test-camera",
            label: "Camera kiểm thử",
            groupId: "test",
            toJSON() {
              return {};
            },
          },
        ],
      });
    },
    { rows, small },
  );
}

test("UC03 camera: reads a small, lower-contrast phone QR in a large frame using one high-resolution stream", async ({
  page,
}) => {
  const qr = await payload(page);
  await fakeCamera(page, qr, true);
  await login(page);
  await page.getByRole("button", { name: "Bật camera", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Check-in thành công" }),
  ).toBeVisible({ timeout: 15000 });
  const debug = await page.evaluate(() => {
    const d = window as unknown as {
      cameraCalls: number;
      cameraConstraints: MediaStreamConstraints;
    };
    return { calls: d.cameraCalls, constraints: d.cameraConstraints };
  });
  expect(debug.calls).toBe(1);
  expect(debug.constraints.video).toMatchObject({
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  });
});
test("UC03 camera: decodes real QR, commits once, reconciles lost response and permits next scan", async ({
  page,
}) => {
  const qr = await payload(page);
  await fakeCamera(page, qr);
  await login(page);
  await expect(page.getByText(/Bản xem thử:/)).toHaveCount(0);
  let scans = 0;
  let lose = true;
  await page.route("**/api/check-ins/scan", async (route) => {
    scans++;
    const response = await route.fetch();
    if (lose) {
      lose = false;
      await route.abort("failed");
    } else await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "Bật camera", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Kiểm tra lại kết quả" }),
  ).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Kiểm tra lại kết quả" }).click();
  await expect(
    page.getByRole("heading", { name: "Check-in thành công" }),
  ).toBeVisible();
  await expect(page.getByText("Hội viên QR", { exact: true })).toBeVisible();
  expect(scans).toBe(1);
  await expect(page.getByRole("button", { name: "Quét tiếp" })).toBeEnabled();
  await page.screenshot({
    path: "test-results/check-in-accepted.png",
    fullPage: true,
  });
});
test("UC03 camera: denied permission gives retry instructions and no scan request", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        throw new DOMException("Denied", "NotAllowedError");
      },
    }),
  );
  await login(page);
  let scans = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/check-ins/scan")) scans++;
  });
  await page.getByRole("button", { name: "Bật camera", exact: true }).click();
  await expect(page.getByText(/Chưa được phép dùng camera/)).toBeVisible();
  expect(scans).toBe(0);
  await expect(
    page.getByRole("button", { name: "Bật camera", exact: true }),
  ).toBeEnabled();
});
