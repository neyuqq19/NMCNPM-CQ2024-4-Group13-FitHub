import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { EquipmentsService } from "../src/modules/equipments/equipments.service";

for (const value of [process.env.DATABASE_URL, process.env.DIRECT_URL]) {
  const url = new URL(value || "postgresql://invalid/invalid");
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/fithub_test"
  ) {
    throw new Error("Equipment tests require isolated fithub_test.");
  }
}

test("UC10: Nest resolves equipment database dependency under tsx and lists equipment", async () => {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    const result = await app.get(EquipmentsService).list({});
    assert.ok(Array.isArray(result.items));
    assert.equal(result.overview.total, result.items.length);
    assert.equal(
      result.overview.total,
      result.overview.operational +
        result.overview.outOfOrder +
        result.overview.retired,
    );
  } finally {
    await app.close();
  }
});
