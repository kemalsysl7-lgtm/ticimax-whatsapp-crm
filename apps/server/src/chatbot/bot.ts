/**
 * "Siparişim nerede?" asistanı (saf fonksiyonlar).
 *
 * Güvenlik: Yanıtlar yalnızca mesajı gönderen telefon numarasına bağlı siparişleri içerir
 * (üyenin kayıtlı telefonu veya siparişin teslimat telefonu). Başka birinin sipariş
 * numarası yazılırsa sipariş var mı yok mu bilgisi bile verilmez.
 */
export type Intent = { kind: "order_status"; orderId: number | null } | { kind: "human" } | { kind: "menu" };

export interface BotOrder {
  id: number;
  statusName: string;
  orderedAt: Date | null;
  total: number;
  currency: string;
  carrierName: string | null;
  trackingNo: string | null;
  trackingLink: string | null;
}

export interface BotReply {
  text: string;
  needsHuman: boolean;
}

/** Türkçe karakterleri sadeleştirip küçük harfe çevirir ("SİPARİŞİM" → "siparisim"). */
export function normalize(text: string): string {
  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/[ışğüöçâî]/g, (c) => ({ ı: "i", ş: "s", ğ: "g", ü: "u", ö: "o", ç: "c", â: "a", î: "i" })[c] ?? c)
    .replace(/\s+/g, " ")
    .trim();
}

const HUMAN_WORDS = ["temsilci", "yetkili", "insan", "musteri hizmetleri", "canli destek", "operator", "biriyle gorus"];
const ORDER_WORDS = ["siparis", "kargo", "nerede", "takip", "teslim", "gelmedi", "ne zaman gelir", "durum"];

export function detectIntent(text: string): Intent {
  const t = normalize(text);
  if (HUMAN_WORDS.some((w) => t.includes(w))) return { kind: "human" };
  const number = /(?:^|\D)(\d{4,10})(?:\D|$)/.exec(t);
  if (number) return { kind: "order_status", orderId: Number(number[1]) };
  if (ORDER_WORDS.some((w) => t.includes(w))) return { kind: "order_status", orderId: null };
  return { kind: "menu" };
}

const dateFmt = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", timeZone: "Europe/Istanbul" });

export function describeOrder(o: BotOrder): string {
  const lines = [`*${o.id}* numaralı sipariş${o.orderedAt ? ` (${dateFmt.format(o.orderedAt)})` : ""}: *${o.statusName}*`];
  if (o.carrierName || o.trackingNo) {
    lines.push(`Kargo: ${[o.carrierName, o.trackingNo ? `takip no ${o.trackingNo}` : null].filter(Boolean).join(", ")}`);
  }
  if (o.trackingLink) lines.push(`Takip linki: ${o.trackingLink}`);
  return lines.join("\n");
}

export function composeReply(
  intent: Intent,
  orders: readonly BotOrder[],
  opts: { customerFirstName: string | null; supportHoursText: string },
): BotReply {
  const greet = opts.customerFirstName ? `Merhaba ${opts.customerFirstName}!` : "Merhaba!";

  if (intent.kind === "human") {
    return {
      needsHuman: true,
      text: `Mesajınızı bir temsilcimize ilettim. ${opts.supportHoursText} arasında size buradan dönüş yapacağız.`,
    };
  }

  if (intent.kind === "order_status") {
    if (intent.orderId !== null) {
      const order = orders.find((o) => o.id === intent.orderId);
      if (!order) {
        return {
          needsHuman: false,
          text:
            `Bu telefon numarasıyla eşleşen ${intent.orderId} numaralı bir sipariş bulamadım. ` +
            "Siparişi verirken kullandığınız numaradan yazdığınızdan emin olun ya da *temsilci* yazın.",
        };
      }
      return { needsHuman: false, text: describeOrder(order) };
    }
    if (!orders.length) {
      return {
        needsHuman: false,
        text:
          "Bu telefon numarasına kayıtlı bir sipariş bulamadım. Sipariş numaranızı yazarsanız tekrar bakarım; " +
          "bir temsilciyle görüşmek için *temsilci* yazabilirsiniz.",
      };
    }
    const latest = orders.slice(0, 3);
    return {
      needsHuman: false,
      text: `${greet} ${latest.length === 1 ? "Son siparişiniz" : "Son siparişleriniz"}:\n\n${latest.map(describeOrder).join("\n\n")}`,
    };
  }

  return {
    needsHuman: false,
    text:
      `${greet} Ben mağazanın WhatsApp asistanıyım.\n` +
      "• Sipariş durumunuz için *siparişim* yazın ya da sipariş numaranızı gönderin.\n" +
      "• Bir temsilciyle görüşmek için *temsilci* yazın.\n" +
      "• Bildirimlerden çıkmak için *DUR* yazın.",
  };
}
