import { isStartKeyword, isStopKeyword } from "../consent/policy";
import { OPT_OUT_BUTTON_TEXT } from "../templates/template";
import type { Clock, ConsentStore, InboundMessage, InboundStore, WhatsAppSender } from "./ports";

export const REPLY_OPTED_OUT =
  "Bildirimlerden çıkarıldınız. Size artık kampanya ve bilgilendirme mesajı göndermeyeceğiz. Tekrar almak isterseniz BAŞLA yazabilirsiniz.";
export const REPLY_OPTED_IN =
  "Bildirimler tekrar açıldı. Sipariş, kargo ve kampanya mesajlarını buradan alacaksınız. İstediğiniz zaman DUR yazarak çıkabilirsiniz.";

export interface InboundDeps {
  inbound: InboundStore;
  consents: ConsentStore;
  whatsapp: WhatsAppSender;
  clock: Clock;
  /** Numara ile eşleşen Ticimax üyesi (izin kaydına bağlamak için). */
  findMemberIdByPhone(phone: string): Promise<number | null>;
}

export type InboundOutcome =
  | "duplicate"
  | "opted_out"
  | "opted_in"
  | "opted_out_reply_failed"
  | "opted_in_reply_failed"
  | "stored";

/**
 * Gelen mesajı kaydeder ve izin anahtar kelimelerini işler.
 * "DUR" (veya "Bildirimleri kapat" butonu) tüm proaktif mesajları durdurur; "BAŞLA" geri açar.
 * Chatbot yanıtları (Faz 2) bu fonksiyonun "stored" sonucundan sonra devreye girer.
 */
export async function handleInboundMessage(deps: InboundDeps, message: InboundMessage): Promise<InboundOutcome> {
  if (!(await deps.inbound.insertIfAbsent(message))) return "duplicate";

  const content = message.buttonText ?? message.text ?? "";
  const stop = isStopKeyword(content) || message.buttonText === OPT_OUT_BUTTON_TEXT;
  const start = !stop && isStartKeyword(content);
  if (!stop && !start) return "stored";

  const memberTicimaxId = await deps.findMemberIdByPhone(message.phone);
  const createdAt = deps.clock.now();
  const evidence = { waMessageId: message.waMessageId, text: content };
  for (const purpose of ["marketing", "transactional"] as const) {
    await deps.consents.append({
      phone: message.phone,
      memberTicimaxId,
      purpose,
      granted: start,
      source: start ? "whatsapp_start" : "whatsapp_stop",
      createdAt,
      evidence,
    });
  }

  // Müşteri az önce yazdığı için 24 saatlik pencere açık: serbest metinle onay verilebilir.
  // Onay mesajı gönderilemese de izin değişikliği kaydedilmiştir; webhook'un tekrar
  // gönderilmesi (duplicate) bu adımı yeniden çalıştırmayacağı için hata yutulur.
  const outcome = start ? "opted_in" : "opted_out";
  try {
    await deps.whatsapp.sendText(message.phone, start ? REPLY_OPTED_IN : REPLY_OPTED_OUT);
  } catch {
    return `${outcome}_reply_failed`;
  }
  return outcome;
}
