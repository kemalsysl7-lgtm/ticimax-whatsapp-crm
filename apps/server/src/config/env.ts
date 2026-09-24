import { z } from "zod";

const hour = z.coerce.number().int().min(0).max(23);

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  ADMIN_API_TOKEN: z.string().min(32, "ADMIN_API_TOKEN en az 32 karakter olmalı"),

  TICIMAX_BASE_URL: z.string().url(),
  TICIMAX_UYE_KODU: z.string().min(1),

  WHATSAPP_GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v23.0"),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().min(1),
  WHATSAPP_ACCESS_TOKEN: z.string().min(1),
  WHATSAPP_APP_SECRET: z.string().min(1),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().min(1),

  TIMEZONE: z.string().default("Europe/Istanbul"),
  QUIET_HOURS_START: hour.default(21),
  QUIET_HOURS_END: hour.default(9),
  MARKETING_WEEKLY_CAP: z.coerce.number().int().min(0).default(2),

  RUN_WORKERS: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(15),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Ortam değişkenlerini doğrular. Hata mesajında yalnızca anahtar isimleri yer alır;
 * değerler (secret'lar) asla hata mesajına veya loga yazılmaz.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const keys = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`Geçersiz ortam değişkenleri:\n  ${keys.join("\n  ")}`);
  }
  return result.data;
}
