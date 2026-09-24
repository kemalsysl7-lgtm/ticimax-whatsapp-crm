import { z } from "zod";
import type { TriggerType } from "../templates/triggers";

/**
 * Otomasyon tanımları. Her otomasyon panelden açılıp kapatılır, bir şablona bağlanır ve
 * kendine özgü ayarları vardır. Varsayılan olarak hepsi kapalıdır: mağaza sahibi şablonu
 * onaylatıp bilinçli olarak açmadan müşteriye otomatik mesaj gitmez.
 */
export type AutomationKey =
  | "order_confirmed"
  | "order_shipped"
  | "order_delivered"
  | "abandoned_cart"
  | "price_drop"
  | "back_in_stock"
  | "birthday"
  | "chatbot";

const hours = z.coerce.number().int().min(1).max(24 * 14);

export const SETTINGS_SCHEMAS = {
  order_confirmed: z.object({}),
  order_shipped: z.object({}),
  order_delivered: z.object({}),
  abandoned_cart: z.object({
    /** Sepet son güncellendikten kaç saat sonra hatırlatma gidecek (1-3 kademe). */
    delaysHours: z.array(hours).min(1).max(3).default([2, 24, 72]),
    /** Kademe başına kupon kodu (boş: kuponsuz). */
    couponCodes: z.array(z.string().max(40)).max(3).default(["", "", ""]),
    cartPath: z.string().max(200).default("sepet"),
  }),
  price_drop: z.object({
    /** Fiyat en az bu yüzde kadar düşmüş olmalı. */
    minDropPercent: z.coerce.number().min(1).max(90).default(5),
    checkEveryHours: hours.default(6),
  }),
  back_in_stock: z.object({
    checkEveryHours: hours.default(6),
  }),
  birthday: z.object({
    couponCode: z.string().max(40).default(""),
    couponValidDays: z.coerce.number().int().min(1).max(60).default(7),
    /** Gönderim saati (İstanbul). */
    sendHour: z.coerce.number().int().min(9).max(20).default(10),
  }),
  chatbot: z.object({
    /** Temsilciye bağlanma mesajında gösterilecek çalışma saatleri metni. */
    supportHoursText: z.string().max(200).default("Hafta içi 09:00-18:00"),
  }),
} satisfies Record<AutomationKey, z.ZodType>;

export type AutomationSettings<K extends AutomationKey> = z.infer<(typeof SETTINGS_SCHEMAS)[K]>;

export interface AutomationDef {
  key: AutomationKey;
  label: string;
  description: string;
  /** Kullanılabilecek şablonların tetikleyicisi; chatbot şablon kullanmaz. */
  trigger: TriggerType | null;
}

export const AUTOMATIONS: AutomationDef[] = [
  { key: "order_confirmed", label: "Sipariş onaylandı", description: "Sipariş \"Onaylandı\" durumuna geçince müşteriye bilgi verir.", trigger: "order_status" },
  { key: "order_shipped", label: "Kargoya verildi", description: "Sipariş kargoya verilince kargo firması, takip numarası ve takip linkiyle bildirim gönderir.", trigger: "order_status" },
  { key: "order_delivered", label: "Teslim edildi", description: "Sipariş teslim edilince teşekkür ve değerlendirme mesajı gönderir.", trigger: "order_status" },
  { key: "abandoned_cart", label: "Terk edilmiş sepet", description: "Sepetinde ürün bırakıp sipariş vermeyen üyelere en fazla 3 kademeli hatırlatma gönderir. Sipariş gelirse durur.", trigger: "abandoned_cart" },
  { key: "price_drop", label: "Fiyat düştü", description: "Fiyat alarmı kuran müşteriye, ürünün fiyatı alarm kurduğu andakinden düşünce haber verir.", trigger: "price_drop" },
  { key: "back_in_stock", label: "Stoğa girdi", description: "Stok alarmı kuran müşteriye, ürün tekrar stoğa girince haber verir.", trigger: "back_in_stock" },
  { key: "birthday", label: "Doğum günü", description: "Doğum günü olan üyelere, ayarlanan saatte kutlama ve isteğe bağlı kupon gönderir.", trigger: "birthday" },
  { key: "chatbot", label: "\"Siparişim nerede?\" asistanı", description: "WhatsApp'tan yazan müşteriye sipariş ve kargo durumunu otomatik yanıtlar; \"temsilci\" yazana gelen kutusunda işaret koyar.", trigger: null },
];

export const AUTOMATION_KEYS = AUTOMATIONS.map((a) => a.key);

export interface AutomationState<K extends AutomationKey = AutomationKey> {
  key: K;
  enabled: boolean;
  templateName: string | null;
  settings: AutomationSettings<K>;
}

export function parseSettings<K extends AutomationKey>(key: K, raw: unknown): AutomationSettings<K> {
  const result = SETTINGS_SCHEMAS[key].safeParse(raw ?? {});
  return (result.success ? result.data : SETTINGS_SCHEMAS[key].parse({})) as AutomationSettings<K>;
}
