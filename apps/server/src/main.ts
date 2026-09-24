import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app/app.module";
import { createContainer } from "./app/container";
import { loadEnv } from "./config/env";

async function bootstrap() {
  const env = loadEnv();
  const container = createContainer(env);
  // rawBody: Meta webhook imzası ham gövde üzerinden doğrulanır.
  const app = await NestFactory.create(AppModule.register(container), { rawBody: true });
  app.enableShutdownHooks();
  await app.listen(env.PORT);
  new Logger("Bootstrap").log(`Sunucu ${env.PORT} portunda çalışıyor (arka plan işleri: ${env.RUN_WORKERS ? "açık" : "kapalı"})`);
}

bootstrap().catch((err: unknown) => {
  console.error((err as Error).message);
  process.exit(1);
});
