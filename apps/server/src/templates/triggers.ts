/**
 * Şablonların hangi olayla tetiklendiği ve o olayda hangi değişkenlerin kullanılabileceği.
 * Panel yalnızca buradaki değişkenleri önerir; doğrulama da bu kataloğa göre yapılır.
 *
 * `*_yolu` değişkenleri URL butonları içindir: Meta, URL butonunda yalnızca sabit bir
 * adresin sonuna eklenen tek bir değişkene izin verir (ör. https://magaza.com/{{urun_yolu}}).
 */
export type TemplateCategory = "UTILITY" | "MARKETING";

export type TriggerType =
  | "order_status"
  | "abandoned_cart"
  | "price_drop"
  | "back_in_stock"
  | "birthday"
  | "membership_anniversary"
  | "segment_campaign";

export interface VariableDef {
  key: string;
  label: string;
  example: string;
}

export interface TriggerDef {
  label: string;
  defaultCategory: TemplateCategory;
  variables: VariableDef[];
}

const ad: VariableDef = { key: "ad", label: "Müşteri adı", example: "Ayşe" };

export const TRIGGERS: Record<TriggerType, TriggerDef> = {
  order_status: {
    label: "Sipariş / kargo durumu",
    defaultCategory: "UTILITY",
    variables: [
      ad,
      { key: "siparis_no", label: "Sipariş numarası", example: "100245" },
      { key: "durum", label: "Sipariş durumu", example: "Kargoya verildi" },
      { key: "kargo_firmasi", label: "Kargo firması", example: "Yurtiçi Kargo" },
      { key: "takip_no", label: "Kargo takip numarası", example: "123456789012" },
      { key: "takip_yolu", label: "Takip linki yolu (URL butonu için)", example: "t/100245" },
    ],
  },
  abandoned_cart: {
    label: "Terk edilmiş sepet",
    defaultCategory: "MARKETING",
    variables: [
      ad,
      { key: "urun_sayisi", label: "Sepetteki ürün sayısı", example: "3" },
      { key: "ilk_urun_adi", label: "Sepetteki ilk ürün", example: "Keten Gömlek" },
      { key: "sepet_toplami", label: "Sepet toplamı", example: "1.249,90 TL" },
      { key: "kupon_kodu", label: "Kupon kodu", example: "SEPET10" },
      { key: "sepet_yolu", label: "Sepet linki yolu (URL butonu için)", example: "sepetim" },
    ],
  },
  price_drop: {
    label: "Fiyat düştü",
    defaultCategory: "MARKETING",
    variables: [
      ad,
      { key: "urun_adi", label: "Ürün adı", example: "Keten Gömlek" },
      { key: "eski_fiyat", label: "Eski fiyat", example: "899,90 TL" },
      { key: "yeni_fiyat", label: "Yeni fiyat", example: "649,90 TL" },
      { key: "indirim_yuzdesi", label: "İndirim yüzdesi", example: "28" },
      { key: "urun_yolu", label: "Ürün linki yolu (URL butonu için)", example: "keten-gomlek" },
    ],
  },
  back_in_stock: {
    label: "Stoğa girdi",
    defaultCategory: "MARKETING",
    variables: [
      ad,
      { key: "urun_adi", label: "Ürün adı", example: "Keten Gömlek" },
      { key: "urun_yolu", label: "Ürün linki yolu (URL butonu için)", example: "keten-gomlek" },
    ],
  },
  birthday: {
    label: "Doğum günü",
    defaultCategory: "MARKETING",
    variables: [
      ad,
      { key: "kupon_kodu", label: "Kupon kodu", example: "DOGUMGUNU20" },
      { key: "kupon_bitis", label: "Kupon son geçerlilik tarihi", example: "30.09.2026" },
    ],
  },
  membership_anniversary: {
    label: "Üyelik yıldönümü",
    defaultCategory: "MARKETING",
    variables: [
      ad,
      { key: "yil_sayisi", label: "Kaçıncı yıl", example: "3" },
      { key: "kupon_kodu", label: "Kupon kodu", example: "YILDONUMU15" },
      { key: "kupon_bitis", label: "Kupon son geçerlilik tarihi", example: "30.09.2026" },
    ],
  },
  segment_campaign: {
    label: "Segment kampanyası",
    defaultCategory: "MARKETING",
    variables: [
      ad,
      { key: "segment_adi", label: "Segment adı", example: "VIP" },
      { key: "kupon_kodu", label: "Kupon kodu", example: "VIP25" },
      { key: "kampanya_yolu", label: "Kampanya linki yolu (URL butonu için)", example: "kampanya/vip" },
    ],
  },
};

export function variablesFor(trigger: TriggerType): VariableDef[] {
  return TRIGGERS[trigger].variables;
}
