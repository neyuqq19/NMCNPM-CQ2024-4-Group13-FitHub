import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const url =
  process.env.TEST_DATABASE_URL ||
  "postgresql://fithub:fithub_local_only@127.0.0.1:55432/fithub_test?schema=public";
const parsed = new URL(url);
if (
  !["localhost", "127.0.0.1"].includes(parsed.hostname) ||
  parsed.pathname !== "/fithub_test"
)
  throw new Error("E2E requires isolated local fithub_test.");
const env = {
  ...process.env,
  DATABASE_URL: url,
  DIRECT_URL: url,
  SEED_PASSWORD: "FitHubDemo!2026",
  PORT: "3101",
  VITE_API_BASE_URL: "http://127.0.0.1:3101",
};
for (const [cwd, args] of [
  [
    resolve(root, "backend"),
    [resolve(root, "node_modules/prisma/build/index.js"), "migrate", "deploy"],
  ],
  [resolve(root, "backend"), ["--import", "tsx", "prisma/seed.ts"]],
  [
    resolve(root, "mobile-client"),
    [
      require.resolve("@playwright/test/cli", {
        paths: [resolve(root, "mobile-client")],
      }),
      "test",
      "--config",
      "playwright.config.ts",
      ...process.argv.slice(2),
    ],
  ],
]) {
  const result = spawnSync(process.execPath, args, {
    cwd,
    env,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
