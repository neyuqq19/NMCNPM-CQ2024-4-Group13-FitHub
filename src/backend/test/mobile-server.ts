import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AppModule } from "../src/app.module";
import { CheckInsService } from "../src/modules/check-ins/check-ins.service";
import { OtpMailer } from "../src/modules/auth/otp-mailer";
import { AllExceptionsFilter } from "../src/common/filters/http-exception.filter";
const target = new URL(
  process.env.DATABASE_URL || "postgresql://invalid/invalid",
);
const directTarget = new URL(process.env.DIRECT_URL || target.toString());
if (
  !["localhost", "127.0.0.1"].includes(target.hostname) ||
  target.pathname !== "/fithub_test" ||
  !["localhost", "127.0.0.1"].includes(directTarget.hostname) ||
  directTarget.pathname !== "/fithub_test"
)
  throw Error("Test-only server requires isolated fithub_test.");
process.env.OTP_HASH_SECRET = randomUUID() + randomUUID();
async function start() {
  const app = await NestFactory.create(AppModule, { logger: false });
  const day = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const offset = Date.parse(`${day}T03:00:00Z`) - Date.now();
  app.get(CheckInsService).now = () => new Date(Date.now() + offset);
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  const codes = new Map<string, string>();
  let failure = false;
  const mailer = app.get(OtpMailer);
  mailer.assertConfigured = () => {};
  mailer.send = async (email, code) => {
    if (failure) throw Error("Test delivery failure");
    codes.set(email, code);
  };
  // This fixture endpoint exists only in this local, database-guarded test bootstrap.
  const server = app.getHttpAdapter().getInstance();
  server.get("/__test/otp", (req: any, res: any) =>
    res.json({ code: codes.get(req.query.email) || null }),
  );
  server.post("/__test/delivery-failure", (req: any, res: any) => {
    failure = req.query.enabled === "true";
    res.json({ failure });
  });
  await app.listen(3102, "127.0.0.1");
}
void start();
