import EmbeddedPostgres from "embedded-postgres";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { createConnection } from "node:net";

const portInUse = await new Promise((resolvePort) => {
  const socket = createConnection({ host: "127.0.0.1", port: 55432 });
  const finish = (open) => {
    socket.destroy();
    resolvePort(open);
  };
  socket.setTimeout(1500);
  socket.once("connect", () => finish(true));
  socket.once("error", () => finish(false));
  socket.once("timeout", () => finish(false));
});

if (portInUse) {
  console.log(
    "Port 55432 is already in use. If local PostgreSQL is running, keep using it; no second instance is needed.",
  );
} else {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const databaseDir = resolve(root, ".local/postgres");
  const envFile = resolve(root, "backend/.env");
  if (!existsSync(envFile)) {
    const example = readFileSync(resolve(root, "backend/.env.example"), "utf8");
    writeFileSync(
      envFile,
      example.replace(
        "replace-with-a-random-secret-at-least-32-characters",
        randomBytes(32).toString("hex"),
      ),
    );
    console.log(
      "Created backend/.env for local development (excluded from Git).",
    );
  }
  mkdirSync(databaseDir, { recursive: true });
  const pg = new EmbeddedPostgres({
    databaseDir,
    user: "fithub",
    password: "fithub_local_only",
    port: 55432,
    persistent: true,
    authMethod: "scram-sha-256",
    postgresFlags: [
      "-c",
      "listen_addresses=127.0.0.1",
      "-c",
      "timezone=Asia/Ho_Chi_Minh",
    ],
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    autoRehydrateSymlinks: true,
    onLog: () => {},
    onError: (message) => {
      if (String(message).includes("FATAL")) console.error(String(message));
    },
  });
  let started = false;
  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    if (started) await pg.stop();
    console.log(
      "Local PostgreSQL stopped. Data is preserved in .local/postgres.",
    );
    process.exit(0);
  }
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  try {
    if (!existsSync(resolve(databaseDir, "PG_VERSION"))) await pg.initialise();
    await pg.start();
    started = true;
    const client = pg.getPgClient();
    await client.connect();
    try {
      for (const name of ["fithub", "fithub_test"]) {
        const { rows } = await client.query(
          "SELECT 1 FROM pg_database WHERE datname = $1",
          [name],
        );
        if (!rows.length) await pg.createDatabase(name);
      }
    } finally {
      await client.end();
    }
    console.log(
      "PostgreSQL ready at 127.0.0.1:55432. Databases: fithub, fithub_test.",
    );
    console.log("Next (another terminal): npm run db:prepare");
    console.log(
      "Keep this process running. Ctrl+C stops it without removing data.",
    );
    setInterval(() => {}, 60_000);
  } catch (error) {
    console.error(
      "Could not start local PostgreSQL:",
      error instanceof Error
        ? error.message
        : String(
            error ??
              "Unknown startup error; check PostgreSQL logs and port 55432.",
          ),
    );
    if (started) await pg.stop();
    process.exit(1);
  }
}
