import "server-only";
import { z } from "zod";

const schema = z.object({
  API_BASE_URL: z.string().url(),
  ADMIN_API_TOKEN: z.string().min(32),
  PANEL_PASSWORD: z.string().min(12, "PANEL_PASSWORD en az 12 karakter olmalı"),
  PANEL_SESSION_SECRET: z.string().min(32, "PANEL_SESSION_SECRET en az 32 karakter olmalı"),
});

export type PanelEnv = z.infer<typeof schema>;

let cached: PanelEnv | null = null;

/** Panel sunucusunun ortam değişkenleri. Bunların hiçbiri tarayıcıya gönderilmez. */
export function panelEnv(): PanelEnv {
  if (cached) return cached;
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const keys = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`Geçersiz panel ortam değişkenleri:\n  ${keys.join("\n  ")}`);
  }
  cached = result.data;
  return cached;
}
