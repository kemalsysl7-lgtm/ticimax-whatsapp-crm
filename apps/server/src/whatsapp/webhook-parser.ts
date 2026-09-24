/**
 * Meta WhatsApp webhook gövdesini uygulamanın iç olaylarına çevirir (anti-corruption katmanı).
 * Meta'nın ham tipleri bu dosyanın dışına çıkmaz.
 */
export type MessageDeliveryStatus = "sent" | "delivered" | "read" | "failed";

export type WebhookEvent =
  | {
      kind: "inbound_message";
      waMessageId: string;
      from: string;
      profileName: string | null;
      timestamp: Date;
      type: string;
      text: string | null;
      /** Hızlı yanıt butonuna basıldığında buton metni/payload'ı. */
      buttonText: string | null;
    }
  | {
      kind: "status";
      waMessageId: string;
      recipient: string;
      status: MessageDeliveryStatus;
      timestamp: Date;
      errorCode: number | null;
      errorTitle: string | null;
      pricingCategory: string | null;
    }
  | {
      kind: "template_status";
      metaTemplateId: string;
      templateName: string;
      event: string;
      reason: string | null;
    };

type Json = Record<string, unknown>;

const asObj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asStr = (v: unknown): string | null => (typeof v === "string" ? v : typeof v === "number" ? String(v) : null);
const toDate = (unixSeconds: unknown): Date => {
  const n = Number(unixSeconds);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : new Date();
};

const STATUSES = new Set<MessageDeliveryStatus>(["sent", "delivered", "read", "failed"]);

export function parseWebhook(payload: unknown): WebhookEvent[] {
  const events: WebhookEvent[] = [];
  for (const entry of asArr(asObj(payload).entry)) {
    for (const change of asArr(asObj(entry).changes)) {
      const { field, value: rawValue } = asObj(change);
      const value = asObj(rawValue);

      if (field === "message_template_status_update") {
        const id = asStr(value.message_template_id);
        const name = asStr(value.message_template_name);
        const event = asStr(value.event);
        if (id && name && event) {
          events.push({ kind: "template_status", metaTemplateId: id, templateName: name, event, reason: asStr(value.reason) });
        }
        continue;
      }

      if (field !== "messages") continue;

      const profileName = asStr(asObj(asObj(asArr(value.contacts)[0]).profile).name);

      for (const raw of asArr(value.messages)) {
        const m = asObj(raw);
        const id = asStr(m.id);
        const from = asStr(m.from);
        if (!id || !from) continue;
        const type = asStr(m.type) ?? "unknown";
        const interactive = asObj(m.interactive);
        const buttonText =
          asStr(asObj(m.button).text) ??
          asStr(asObj(interactive.button_reply).title) ??
          asStr(asObj(interactive.list_reply).title);
        events.push({
          kind: "inbound_message",
          waMessageId: id,
          from,
          profileName,
          timestamp: toDate(m.timestamp),
          type,
          text: asStr(asObj(m.text).body),
          buttonText,
        });
      }

      for (const raw of asArr(value.statuses)) {
        const s = asObj(raw);
        const id = asStr(s.id);
        const status = asStr(s.status) as MessageDeliveryStatus | null;
        if (!id || !status || !STATUSES.has(status)) continue;
        const error = asObj(asArr(s.errors)[0]);
        const code = Number(error.code);
        events.push({
          kind: "status",
          waMessageId: id,
          recipient: asStr(s.recipient_id) ?? "",
          status,
          timestamp: toDate(s.timestamp),
          errorCode: Number.isFinite(code) ? code : null,
          errorTitle: asStr(error.title),
          pricingCategory: asStr(asObj(s.pricing).category),
        });
      }
    }
  }
  return events;
}
