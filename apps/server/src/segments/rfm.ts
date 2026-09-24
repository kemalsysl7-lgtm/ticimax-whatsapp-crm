/**
 * RFM segmentasyonu (framework'ten bağımsız).
 *
 *  R (Recency)   — son alışverişten bu yana geçen gün
 *  F (Frequency) — geçerli sipariş sayısı
 *  M (Monetary)  — toplam harcama
 *
 * R ve F sabit eşiklerle, M ise alışveriş yapmış müşteriler arasındaki beşte birlik
 * dilimlere (quintile) göre 1-5 puanlanır. Segment, aşağıdaki kurallardan ilk eşleşendir.
 */
export type SegmentKey =
  | "champions"
  | "loyal"
  | "potential_loyal"
  | "new"
  | "one_time"
  | "at_risk"
  | "sleeping"
  | "lost"
  | "needs_attention"
  | "no_orders";

export interface SegmentDef {
  key: SegmentKey;
  label: string;
  description: string;
  /** Panelde önerilen aksiyon. */
  action: string;
}

export const SEGMENTS: SegmentDef[] = [
  { key: "champions", label: "Şampiyonlar (VIP)", description: "Yakın zamanda, sık ve yüksek tutarda alışveriş yapanlar.", action: "Özel teklif, erken erişim; indirimle alışkanlıklarını bozmayın." },
  { key: "loyal", label: "Sadık müşteriler", description: "Düzenli alışveriş yapan, hâlâ aktif müşteriler.", action: "Sadakat kuponu, yeni ürün duyurusu." },
  { key: "potential_loyal", label: "Potansiyel sadık", description: "Yakın zamanda 2-3 kez alışveriş yapmış.", action: "İkinci/üçüncü siparişi teşvik eden kampanya." },
  { key: "new", label: "Yeni müşteriler", description: "İlk siparişini son 60 gün içinde vermiş.", action: "Hoş geldin mesajı, ikinci sipariş kuponu." },
  { key: "one_time", label: "Tek seferlik", description: "Bir kez alışveriş yapıp geri dönmemiş.", action: "Geri dönüş kuponu, ilgili ürün önerisi." },
  { key: "at_risk", label: "Risk altında", description: "Eskiden sık alışveriş yapan ama uzun süredir gelmeyenler.", action: "Kişisel geri kazanma mesajı, güçlü teklif." },
  { key: "sleeping", label: "Uyuyan", description: "Uzun süredir alışveriş yapmayan, az siparişli müşteriler.", action: "\"Sizi özledik\" kampanyası." },
  { key: "lost", label: "Kaybedilmiş", description: "Çok uzun süredir (8 aydan fazla) alışveriş yapmamış.", action: "Düşük maliyetli son deneme; yanıt yoksa sık mesaj atmayın." },
  { key: "needs_attention", label: "İlgi bekleyen", description: "Ortalama değerlerde, belirgin bir eğilimi olmayanlar.", action: "Sınırlı süreli teklif." },
  { key: "no_orders", label: "Hiç alışveriş yapmamış", description: "Üye olmuş ama sipariş vermemiş.", action: "İlk sipariş kuponu." },
];

export const SEGMENT_KEYS = SEGMENTS.map((s) => s.key);

export interface CustomerStats {
  memberTicimaxId: number;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: Date | null;
}

export interface CustomerSegment extends CustomerStats {
  segment: SegmentKey;
  recencyDays: number | null;
  r: number;
  f: number;
  m: number;
}

export function recencyScore(days: number): number {
  if (days <= 30) return 5;
  if (days <= 60) return 4;
  if (days <= 120) return 3;
  if (days <= 240) return 2;
  return 1;
}

export function frequencyScore(orders: number): number {
  if (orders >= 10) return 5;
  if (orders >= 5) return 4;
  if (orders >= 3) return 3;
  if (orders === 2) return 2;
  return 1;
}

/** Harcamaya göre 1-5 puan veren fonksiyonu, alışveriş yapmış müşterilerin dağılımından üretir. */
export function monetaryScorer(totals: number[]): (value: number) => number {
  const sorted = totals.filter((t) => t > 0).sort((a, b) => a - b);
  if (!sorted.length) return () => 1;
  const cut = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
  const thresholds = [cut(0.2), cut(0.4), cut(0.6), cut(0.8)];
  return (value) => 1 + thresholds.filter((t) => value >= t).length;
}

export function classify(r: number, f: number, m: number): SegmentKey {
  if (r >= 4 && f >= 4 && m >= 4) return "champions";
  if (r >= 3 && f >= 4) return "loyal";
  if (r === 1) return "lost";
  if (r <= 2 && f >= 3) return "at_risk";
  if (r >= 4 && f === 1) return "new";
  if (r >= 4 && f >= 2) return "potential_loyal";
  if (r === 2) return "sleeping";
  if (f === 1) return "one_time";
  return "needs_attention";
}

export function segmentCustomers(stats: readonly CustomerStats[], now: Date): CustomerSegment[] {
  const scoreM = monetaryScorer(stats.filter((s) => s.orderCount > 0).map((s) => s.totalSpent));
  return stats.map((s) => {
    if (s.orderCount === 0 || !s.lastOrderAt) {
      return { ...s, segment: "no_orders", recencyDays: null, r: 0, f: 0, m: 0 };
    }
    const recencyDays = Math.max(0, Math.floor((now.getTime() - s.lastOrderAt.getTime()) / 86_400_000));
    const r = recencyScore(recencyDays);
    const f = frequencyScore(s.orderCount);
    const m = scoreM(s.totalSpent);
    return { ...s, segment: classify(r, f, m), recencyDays, r, f, m };
  });
}

/** Segment hesabında sayılmayan sipariş durumları: iptal, iade, silinmiş, iade ödemesi yapıldı. */
export const EXCLUDED_ORDER_STATUSES = [8, 9, 10, 13];
