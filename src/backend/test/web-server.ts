import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { CheckInsService } from "../src/modules/check-ins/check-ins.service";
import { AllExceptionsFilter } from "../src/common/filters/http-exception.filter";
for (const value of [process.env.DATABASE_URL, process.env.DIRECT_URL]) {
  const u = new URL(value || "postgresql://invalid/invalid");
  if (
    !["localhost", "127.0.0.1"].includes(u.hostname) ||
    u.pathname != "/fithub_test"
  )
    throw Error("Test server requires isolated fithub_test.");
}
async function start() {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  const day = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const offset = Date.parse(`${day}T03:00:00Z`) - Date.now();
  app.get(CheckInsService).now = () => new Date(Date.now() + offset);
  await app.listen(3101, "127.0.0.1");
}
void start();
