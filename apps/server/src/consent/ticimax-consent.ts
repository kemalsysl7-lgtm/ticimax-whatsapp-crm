import type { ConsentRecord } from "./policy";

/**
 * Ticimax'teki `SmsIzin` değerini izin defterine yansıtır.
 *
 * Kural: Yalnızca Ticimax'teki değer, defterdeki en son *Ticimax kaynaklı* kayıttan
 * farklıysa yeni kayıt eklenir. Böylece müşteri WhatsApp'ta "DUR" dediyse, Ticimax'te
 * izin hâlâ açık görünse bile her senkronda izin yeniden açılmaz; ancak izin Ticimax'te
 * gerçekten değişirse (ör. müşteri hesabından tekrar onay verirse) o değişiklik uygulanır.
 *
 * Varsayım (panelden değiştirilebilir hale getirilecek): SmsIzin=true hem pazarlama hem
 * bilgilendirme mesajlarına izin sayılır; SmsIzin=false yalnızca pazarlama iznini kapatır.
 */
export function consentRecordsFromTicimax(
  smsPermission: boolean,
  existing: readonly ConsentRecord[],
  now: Date,
): ConsentRecord[] {
  const lastFromTicimax = existing
    .filter((r) => r.source === "ticimax_sms_izin" && r.purpose === "marketing")
    .reduce<ConsentRecord | undefined>((acc, r) => (!acc || r.createdAt >= acc.createdAt ? r : acc), undefined);

  if (lastFromTicimax?.granted === smsPermission) return [];
  if (!lastFromTicimax && !smsPermission) return [];

  const record = (purpose: ConsentRecord["purpose"]): ConsentRecord => ({
    purpose,
    granted: smsPermission,
    source: "ticimax_sms_izin",
    createdAt: now,
  });
  return smsPermission ? [record("marketing"), record("transactional")] : [record("marketing")];
}
