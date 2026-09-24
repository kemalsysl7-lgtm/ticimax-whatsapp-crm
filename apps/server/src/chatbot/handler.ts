import type { AutomationQueries } from "../db/automation-queries";
import { composeReply, detectIntent } from "./bot";

/**
 * Gelen serbest mesaja asistan yanıtı. Müşteri az önce yazdığı için 24 saatlik pencere
 * açıktır; şablon gerekmez.
 *
 * - Asistan kapalıysa veya konuşma bir temsilciye devredilmişse yanıt vermez.
 * - Döngü ve kötüye kullanıma karşı bir numaraya saatte en fazla 10 asistan yanıtı gider.
 */
export const MAX_BOT_REPLIES_PER_HOUR = 10;

export interface ChatbotDeps {
  queries: AutomationQueries;
  sendText(to: string, text: string): Promise<string>;
  clock: { now(): Date };
}

export type ChatbotOutcome = "disabled" | "handed_to_human" | "rate_limited" | "replied" | "reply_failed";

export async function handleChatbot(deps: ChatbotDeps, phone: string, text: string): Promise<ChatbotOutcome> {
  const state = await deps.queries.getAutomation("chatbot");
  if (!state.enabled) return "disabled";
  const conversation = await deps.queries.getConversation(phone);
  if (conversation?.needsHuman) return "handed_to_human";
  const now = deps.clock.now();
  if ((await deps.queries.botRepliesSince(phone, new Date(now.getTime() - 3_600_000))) >= MAX_BOT_REPLIES_PER_HOUR) {
    return "rate_limited";
  }

  const member = await deps.queries.memberByPhone(phone);
  const orders = await deps.queries.ordersForPhone(phone);
  const reply = composeReply(detectIntent(text), orders, {
    customerFirstName: member?.firstName || null,
    supportHoursText: state.settings.supportHoursText,
  });

  let waMessageId: string;
  try {
    waMessageId = await deps.sendText(phone, reply.text);
  } catch {
    return "reply_failed";
  }
  await deps.queries.recordChat({ phone, direction: "out", author: "bot", text: reply.text, waMessageId, at: deps.clock.now() });
  if (reply.needsHuman) await deps.queries.setNeedsHuman(phone, true);
  return "replied";
}
