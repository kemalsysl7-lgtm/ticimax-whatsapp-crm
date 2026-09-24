const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeZone: "Europe/Istanbul" });
const dateTime = new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" });

export const formatMoney = (v: number) => money.format(v);
export const formatDate = (v: string | null) => (v ? date.format(new Date(v)) : "—");
export const formatDateTime = (v: string | null) => (v ? dateTime.format(new Date(v)) : "—");

/** 905321234567 → 0532 123 45 67 */
export function formatPhone(phone: string | null): string {
  if (!phone) return "—";
  const d = phone.startsWith("90") ? `0${phone.slice(2)}` : phone;
  return d.length === 11 ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9)}` : d;
}

/** "3 gün önce" gibi kısa göreli süre. */
export function daysAgo(v: string | null, now = Date.now()): string {
  if (!v) return "—";
  const days = Math.floor((now - new Date(v).getTime()) / 86_400_000);
  if (days <= 0) return "bugün";
  if (days < 30) return `${days} gün önce`;
  if (days < 365) return `${Math.floor(days / 30)} ay önce`;
  return `${Math.floor(days / 365)} yıl önce`;
}
