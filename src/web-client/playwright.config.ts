import { defineConfig } from "@playwright/test";
// Run npm run test:e2e from src: the runner enforces the test database and seeds it.
const db = new URL(process.env.DATABASE_URL || "postgresql://invalid/invalid");
if (
  !["localhost", "127.0.0.1"].includes(db.hostname) ||
  db.pathname !== "/fithub_test"
)
  throw new Error("Use npm run test:e2e from src.");
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5174",
    channel: "msedge",
    headless: true,
    viewport: { width: 1280, height: 960 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node --import tsx test/web-server.ts",
      cwd: "../backend",
      url: "http://127.0.0.1:3101/api/health",
      reuseExistingServer: false,
    },
    {
      command: "npm run dev --workspaces=false -- --port 5174",
      env: { VITE_CACHE_DIR: "node_modules/.vite-e2e" },
      url: "http://127.0.0.1:5174",
      reuseExistingServer: false,
    },
  ],
  reporter: "list",
});
