/**
 * Fiyat ve stok alarmlarının değerlendirilmesi (saf fonksiyonlar).
 * Ticimax alarm listesi ürünün güncel fiyatını, alarm kurulduğu andaki fiyatı (EklenenFiyat)
 * ve toplam stok adedini birlikte döndürür.
 */
export interface PriceAlarm {
  alarmId: number;
  memberTicimaxId: number;
  productName: string;
  productUrl: string | null;
  priceWhenAdded: number;
  currentPrice: number;
}

export interface StockAlarm {
  alarmId: number;
  memberTicimaxId: number;
  productName: string;
  productUrl: string | null;
  stock: number;
}

/** Fiyat, alarm kurulduğu andakinden en az `minDropPercent` ve en az 1 birim düştüyse true. */
export function priceDropped(alarm: PriceAlarm, minDropPercent: number): boolean {
  if (alarm.priceWhenAdded <= 0 || alarm.currentPrice <= 0) return false;
  const drop = alarm.priceWhenAdded - alarm.currentPrice;
  return drop >= 1 && (drop / alarm.priceWhenAdded) * 100 >= minDropPercent;
}

export function dropPercent(alarm: PriceAlarm): number {
  return Math.round(((alarm.priceWhenAdded - alarm.currentPrice) / alarm.priceWhenAdded) * 100);
}

export function backInStock(alarm: StockAlarm): boolean {
  return alarm.stock > 0;
}

/** Mağaza URL'sinden, URL butonunun sonuna eklenecek yolu çıkarır ("/urun/keten-gomlek" → "urun/keten-gomlek"). */
export function productPath(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url, "https://magaza.local");
    const path = `${u.pathname}${u.search}`.replace(/^\/+/, "");
    return path || null;
  } catch {
    return null;
  }
}
