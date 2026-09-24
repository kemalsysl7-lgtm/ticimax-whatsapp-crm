/**
 * Ticimax'teki serbest formatlı telefon numaralarını WhatsApp'ın beklediği
 * ülke kodlu, yalnızca rakamlardan oluşan biçime (ör. "905321234567") çevirir.
 *
 * Yalnızca Türkiye cep telefonları (5xx) desteklenir; tanınmayan biçimler için null döner
 * ki yanlış numaraya mesaj gönderilmesin.
 */
export function normalizeTrMobile(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0090")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = `90${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith("5")) digits = `90${digits}`;
  return /^905\d{9}$/.test(digits) ? digits : null;
}
