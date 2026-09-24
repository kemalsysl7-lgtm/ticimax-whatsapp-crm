/** Doğum günü hesapları (saf fonksiyonlar, saat dilimi İstanbul varsayılır). */
export function localDateParts(now: Date, timezone: string): { year: number; month: number; day: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") };
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Doğum tarihi (YYYY-MM-DD) bugünün ay-gününe denk geliyor mu? 29 Şubat doğumlular artık olmayan yıllarda 28 Şubat'ta kutlanır. */
export function isBirthdayToday(birthDate: string | null, today: { year: number; month: number; day: number }): boolean {
  if (!birthDate) return false;
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!m) return false;
  let month = Number(m[1]);
  let day = Number(m[2]);
  if (month === 2 && day === 29 && !isLeap(today.year)) day = 28;
  return month === today.month && day === today.day;
}

/** "30.09.2026" biçimi. */
export function formatDateTr(d: { year: number; month: number; day: number }): string {
  return `${String(d.day).padStart(2, "0")}.${String(d.month).padStart(2, "0")}.${d.year}`;
}

export function addDays(d: { year: number; month: number; day: number }, days: number) {
  const date = new Date(Date.UTC(d.year, d.month - 1, d.day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}
