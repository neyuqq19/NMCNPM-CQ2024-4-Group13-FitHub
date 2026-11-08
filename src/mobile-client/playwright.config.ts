import { defineConfig } from "@playwright/test";
const db = new URL(process.env.DATABASE_URL || "postgresql://invalid/invalid");
if (
  !["localhost", "127.0.0.1"].includes(db.hostname) ||
  db.pathname !== "/fithub_test"
)
  throw Error("Use npm run test:mobile from src.");
export default defineConfig({
  testDir: "./tests",
  workers: 1,
  fullyParallel: false,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:8082",
    channel: "msedge",
    headless: true,
    viewport: { width: 390, height: 844 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node --import tsx test/mobile-server.ts",
      cwd: "../backend",
      url: "http://127.0.0.1:3102/api/health",
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command:
        "node ../node_modules/expo/bin/cli start --web --port 8082 --localhost",
      cwd: ".",
      url: "http://127.0.0.1:8082",
      reuseExistingServer: false,
      timeout: 120000,
      env: { CI: "1", EXPO_PUBLIC_API_URL: "http://127.0.0.1:3102" },
    },
  ],
  reporter: "list",
});
