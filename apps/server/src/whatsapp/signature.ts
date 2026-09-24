import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Meta webhook imzasını doğrular: `X-Hub-Signature-256: sha256=<hex>`, ham gövdenin
 * App Secret ile HMAC-SHA256 özetidir. İmzası doğrulanmayan hiçbir webhook işlenmez.
 */
export function verifyMetaSignature(rawBody: Buffer, header: string | undefined, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const received = Buffer.from(header.slice("sha256=".length), "hex");
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  return received.length === expected.length && timingSafeEqual(received, expected);
}
