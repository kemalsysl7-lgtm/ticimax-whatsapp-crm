import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Kargo takip yönlendirme linki: `t/<siparişId>-<imza>`.
 * Meta, URL butonunda yalnızca sabit bir adresin sonuna eklenen tek değişkene izin verdiği
 * için kargo firmasının (değişken) adresine kendi alan adımız üzerinden yönlendiririz. İmza,
 * sipariş numarası tahmin edilerek başkalarının takip linkine ulaşılmasını engeller.
 */
function sign(orderId: number, secret: string): string {
  return createHmac("sha256", `tracking-link:${secret}`).update(String(orderId)).digest("base64url").slice(0, 16);
}

export function trackingPath(orderId: number, secret: string): string {
  return `t/${orderId}-${sign(orderId, secret)}`;
}

export function verifyTrackingRef(ref: string, secret: string): number | null {
  const m = /^(\d{1,12})-([A-Za-z0-9_-]{16})$/.exec(ref);
  if (!m) return null;
  const orderId = Number(m[1]);
  const expected = Buffer.from(sign(orderId, secret));
  const given = Buffer.from(m[2]!);
  return given.length === expected.length && timingSafeEqual(given, expected) ? orderId : null;
}
