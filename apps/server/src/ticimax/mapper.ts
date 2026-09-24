import { normalizeTrMobile } from "../common/phone";

/**
 * Ticimax SOAP yanıtlarını uygulamanın iç modeline çevirir (anti-corruption katmanı).
 * node-soap, ilkel değerleri bazen string (ör. "true", "12.5") olarak döndürür ve WCF
 * boş tarihleri "0001-01-01T00:00:00" olarak gönderir; bu dosya hepsini normalize eder.
 */
export interface Member {
  ticimaxId: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  birthDate: string | null; // YYYY-MM-DD
  smsPermission: boolean;
  mailPermission: boolean;
  memberTypeId: number | null;
  updatedAt: Date | null;
}

export interface Order {
  ticimaxId: number;
  memberTicimaxId: number | null;
  statusCode: number;
  statusName: string;
  customerName: string;
  deliveryPhone: string | null;
  total: number;
  currency: string;
  orderedAt: Date | null;
  cargoCompanyId: number | null;
  trackingNo: string | null;
}

export interface ShipmentPackage {
  ticimaxId: number;
  orderTicimaxId: number;
  carrierName: string | null;
  trackingNo: string | null;
  trackingLink: string | null;
  createdAt: Date | null;
}

/** Ticimax "Sipariş Durumu Değişkenleri". */
export const ORDER_STATUS_NAMES: Record<number, string> = {
  0: "Ön sipariş",
  1: "Onay bekliyor",
  2: "Onaylandı",
  3: "Ödeme bekliyor",
  4: "Paketleniyor",
  5: "Tedarik ediliyor",
  6: "Kargoya verildi",
  7: "Teslim edildi",
  8: "İptal edildi",
  9: "İade edildi",
  10: "Silinmiş",
  11: "İade talebi alındı",
  12: "İade ulaştı, ödeme yapılacak",
  13: "İade ödemesi yapıldı",
  14: "Teslimat öncesi iptal talebi",
  15: "İptal talebi",
  16: "Kısmi iade talebi",
  17: "Kısmi iade yapıldı",
};

type Raw = Record<string, unknown>;

export function toArray<T = Raw>(value: unknown): T[] {
  if (value === null || value === undefined) return [];
  return (Array.isArray(value) ? value : [value]) as T[];
}

const str = (v: unknown): string | null => {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  return null;
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const bool = (v: unknown): boolean => v === true || v === "true" || v === 1 || v === "1";

const WCF_MIN_YEAR = 1900;

export function toDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) || d.getUTCFullYear() < WCF_MIN_YEAR ? null : d;
}

/** Doğum tarihi gibi yalnızca gün bilgisi taşıyan alanlar için saat dilimi kaymasından etkilenmeyen YYYY-MM-DD. */
export function toDateOnly(v: unknown): string | null {
  if (typeof v === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
    return m && Number(m[1]) >= WCF_MIN_YEAR ? `${m[1]}-${m[2]}-${m[3]}` : null;
  }
  const d = toDate(v);
  if (!d) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function mapMember(raw: Raw): Member | null {
  const id = num(raw.ID);
  if (!id) return null;
  return {
    ticimaxId: id,
    firstName: str(raw.Isim) ?? "",
    lastName: str(raw.Soyisim) ?? "",
    email: str(raw.Mail)?.toLowerCase() ?? null,
    phone: normalizeTrMobile(str(raw.CepTelefonu)) ?? normalizeTrMobile(str(raw.Telefon)),
    birthDate: toDateOnly(raw.DogumTarihi),
    smsPermission: bool(raw.SmsIzin),
    mailPermission: bool(raw.MailIzin),
    memberTypeId: num(raw.UyeTuruID),
    updatedAt: toDate(raw.DuzenlemeTarihi),
  };
}

export function mapOrder(raw: Raw): Order | null {
  const id = num(raw.ID);
  if (!id) return null;
  const statusCode = num(raw.Durum) ?? -1;
  const delivery = (raw.TeslimatAdresi ?? {}) as Raw;
  const fullName = [str(raw.UyeAdi), str(raw.UyeSoyadi)].filter(Boolean).join(" ");
  return {
    ticimaxId: id,
    memberTicimaxId: num(raw.UyeID) || null,
    statusCode,
    statusName: ORDER_STATUS_NAMES[statusCode] ?? str(raw.SiparisDurumu) ?? "Bilinmiyor",
    customerName: fullName || str(raw.AdiSoyadi) || "",
    deliveryPhone: normalizeTrMobile(str(delivery.AliciTelefon)),
    total: num(raw.SiparisToplamTutari) ?? num(raw.ToplamTutar) ?? 0,
    currency: str(raw.ParaBirimi) ?? "TL",
    orderedAt: toDate(raw.SiparisTarihi),
    cargoCompanyId: num(raw.KargoFirmaId) || null,
    trackingNo: str(raw.KargoTakipNo),
  };
}

export function mapShipmentPackage(raw: Raw): ShipmentPackage | null {
  const id = num(raw.ID);
  const orderId = num(raw.SiparisID);
  if (!id || !orderId) return null;
  return {
    ticimaxId: id,
    orderTicimaxId: orderId,
    carrierName: str(raw.KargoEntegrasyonTanim),
    trackingNo: str(raw.KargoTakipNumarasi),
    trackingLink: str(raw.KargoTakipLink),
    createdAt: toDate(raw.EklenmeTarihi),
  };
}

export interface Cart {
  cartId: number;
  memberTicimaxId: number | null;
  updatedAt: Date | null;
  items: Array<{ name: string; quantity: number; unitPrice: number }>;
  total: number;
}

/**
 * WebSepet → Cart. Ticimax'te "...KDV" alanları KDV tutarını, "...KDVli" alanları KDV dahil
 * fiyatı taşır (GetSepet dokümanı); satır fiyatı bu yüzden net + KDV tutarıdır.
 */
export function mapCart(raw: Raw): Cart | null {
  const id = num(raw.ID);
  if (!id) return null;
  const items = toArray((raw.Urunler as Raw | undefined)?.WebSepetUrun).map((u) => ({
    name: str(u.UrunAdi) ?? "Ürün",
    quantity: num(u.Adet) ?? 1,
    unitPrice: (num(u.UrunSepetFiyati) ?? 0) + (num(u.UrunSepetFiyatiKDV) ?? 0),
  }));
  return {
    cartId: id,
    memberTicimaxId: num(raw.UyeID) || null,
    updatedAt: toDate(raw.SepetTarihi),
    items,
    total: Math.round(items.reduce((a, i) => a + i.unitPrice * i.quantity, 0) * 100) / 100,
  };
}

export interface ProductAlarm {
  alarmId: number;
  memberTicimaxId: number;
  productName: string;
  productUrl: string | null;
  /** Fiyat alarmında: alarm kurulduğu andaki (vitrindeki) fiyat. */
  priceWhenAdded: number;
  /** KDV dahil güncel fiyat (UrunFiyati + UrunFiyatiKdv). */
  currentPrice: number;
  stock: number;
}

/** WebFiyatAlarmUrunler / WebStokAlarmUrunler → ProductAlarm. */
export function mapProductAlarm(raw: Raw, idField: "FiyatAlarmUrunID" | "StokAlarmUrunId"): ProductAlarm | null {
  const id = num(raw[idField]);
  const member = num(raw.UyeID);
  if (!id || !member) return null;
  return {
    alarmId: id,
    memberTicimaxId: member,
    productName: str(raw.UrunAdi) ?? "Ürün",
    productUrl: str(raw.UrunUrl),
    priceWhenAdded: num(raw.EklenenFiyat) ?? 0,
    currentPrice: Math.round(((num(raw.UrunFiyati) ?? 0) + (num(raw.UrunFiyatiKdv) ?? 0)) * 100) / 100,
    stock: num(raw.ToplamStokAdedi) ?? 0,
  };
}
