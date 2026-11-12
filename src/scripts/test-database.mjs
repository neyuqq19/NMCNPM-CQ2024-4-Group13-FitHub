import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cwd = resolve(root, "backend");
const url =
  process.env.TEST_DATABASE_URL ||
  "postgresql://fithub:fithub_local_only@127.0.0.1:55432/fithub_test?schema=public";
const parsed = new URL(url);
if (
  !["127.0.0.1", "localhost"].includes(parsed.hostname) ||
  parsed.pathname !== "/fithub_test"
) {
  throw new Error(
    "Database tests only run against local fithub_test. No other database will be modified.",
  );
}
const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url };
for (const args of [
  [resolve(root, "node_modules/prisma/build/index.js"), "migrate", "deploy"],
  [
    "--import",
    "tsx",
    "--test",
    "--test-concurrency=1",
    "test/database.test.ts",
    "test/members.test.ts",
    "test/auth-registration.test.ts",
    "test/check-ins.test.ts",
    "test/sales.test.ts",
    "test/workouts-rules.test.ts",
    "test/workouts.test.ts",
  ],
]) {
  const result = spawnSync(process.execPath, args, {
    cwd,
    env,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
