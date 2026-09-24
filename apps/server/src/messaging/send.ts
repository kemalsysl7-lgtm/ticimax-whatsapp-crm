import { currentConsent, evaluateSendPolicy, type SendPolicyConfig } from "../consent/policy";
import { MissingVariableError, buildSendComponents, type VariableValues } from "../templates/template";
import { GraphApiError } from "../whatsapp/graph-client";
import type { Clock, ConsentStore, MessageQueue, MessageStore, TemplateStore, WhatsAppSender } from "./ports";

export interface SendDeps {
  messages: MessageStore;
  templates: TemplateStore;
  consents: ConsentStore;
  whatsapp: WhatsAppSender;
  queue: MessageQueue;
  clock: Clock;
  policy: SendPolicyConfig;
}

export type EnqueueResult = { messageId: number; created: true } | { messageId: null; created: false; reason: string };

/**
 * Bir iş olayı için mesajı kuyruğa alır. Aynı `dedupeKey` ikinci kez gelirse yeni mesaj
 * oluşmaz; bu sayede senkron işlerinin tekrar çalışması müşteriye tekrar mesaj göndermez.
 */
export async function enqueueMessage(
  deps: Pick<SendDeps, "messages" | "templates" | "queue">,
  input: {
    dedupeKey: string;
    phone: string | null;
    memberTicimaxId: number | null;
    templateName: string;
    variables: VariableValues;
    campaignId?: number | null;
  },
): Promise<EnqueueResult> {
  const template = await deps.templates.getByName(input.templateName);
  if (!template) return { messageId: null, created: false, reason: "template_not_found" };

  const id = await deps.messages.insertIfAbsent({
    dedupeKey: input.dedupeKey,
    phone: input.phone,
    memberTicimaxId: input.memberTicimaxId,
    templateId: template.id,
    category: template.category,
    variables: input.variables,
    campaignId: input.campaignId ?? null,
  });
  if (id === null) return { messageId: null, created: false, reason: "duplicate" };

  await deps.queue.add(id);
  return { messageId: id, created: true };
}

export type ProcessOutcome =
  | { outcome: "sent"; waMessageId: string }
  | { outcome: "skipped"; reason: string }
  | { outcome: "deferred"; retryAt: Date }
  | { outcome: "failed"; code: number | null }
  | { outcome: "noop" };

/**
 * Kuyruktaki tek bir mesajı işler: şablon onayı → izin → politika → gönderim.
 * Yeniden denenebilir Graph hatalarında mesajı kuyruğa geri bırakıp hatayı fırlatır
 * (BullMQ yeniden dener); kalıcı hatalarda mesajı "failed" olarak işaretler.
 */
export async function processQueuedMessage(deps: SendDeps, messageId: number): Promise<ProcessOutcome> {
  const message = await deps.messages.get(messageId);
  if (!message || message.status !== "queued") return { outcome: "noop" };
  if (!(await deps.messages.claim(messageId))) return { outcome: "noop" };

  const skip = async (reason: string): Promise<ProcessOutcome> => {
    await deps.messages.markSkipped(messageId, reason);
    return { outcome: "skipped", reason };
  };

  const template = await deps.templates.getById(message.templateId);
  if (!template || template.status !== "approved") return skip("template_not_approved");

  const now = deps.clock.now();
  const consent = message.phone ? currentConsent(await deps.consents.recordsFor(message.phone)) : { transactional: false, marketing: false };
  const marketingSentLast7Days =
    message.phone && template.category === "MARKETING"
      ? await deps.messages.countMarketingSentSince(message.phone, new Date(now.getTime() - 7 * 86_400_000))
      : 0;

  const decision = evaluateSendPolicy(
    { category: template.category, phone: message.phone, consent, marketingSentLast7Days, now },
    deps.policy,
  );
  if (decision.action === "skip") return skip(decision.reason);
  if (decision.action === "defer") {
    await deps.messages.release(messageId);
    await deps.queue.add(messageId, { delayMs: decision.retryAt.getTime() - now.getTime() });
    return { outcome: "deferred", retryAt: decision.retryAt };
  }

  let components: Array<Record<string, unknown>>;
  try {
    components = buildSendComponents(template, message.variables);
  } catch (err) {
    if (err instanceof MissingVariableError) return skip(`missing_variables:${err.missing.join(",")}`);
    throw err;
  }

  try {
    const waMessageId = await deps.whatsapp.sendTemplate({
      to: message.phone!,
      templateName: template.name,
      language: template.language,
      components,
    });
    await deps.messages.markSent(messageId, waMessageId, now);
    return { outcome: "sent", waMessageId };
  } catch (err) {
    if (err instanceof GraphApiError && !err.retryable) {
      await deps.messages.markFailed(messageId, err.code, err.message);
      return { outcome: "failed", code: err.code };
    }
    await deps.messages.release(messageId);
    throw err;
  }
}
