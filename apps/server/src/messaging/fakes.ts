import type { ConsentRecord } from "../consent/policy";
import type {
  ConsentStore,
  InboundMessage,
  InboundStore,
  MessageQueue,
  MessageStore,
  NewMessage,
  QueuedMessage,
  StoredTemplate,
  TemplateStore,
  WhatsAppSender,
} from "./ports";

/** Testler için bellek içi port implementasyonları. */
export class FakeMessageStore implements MessageStore {
  rows = new Map<number, QueuedMessage & NewMessage & { skipReason?: string; waMessageId?: string; sentAt?: Date; errorCode?: number | null }>();
  private seq = 0;

  async insertIfAbsent(m: NewMessage) {
    if ([...this.rows.values()].some((r) => r.dedupeKey === m.dedupeKey)) return null;
    const id = ++this.seq;
    this.rows.set(id, { ...m, id, status: "queued" });
    return id;
  }
  async get(id: number) {
    return this.rows.get(id) ?? null;
  }
  async claim(id: number) {
    const r = this.rows.get(id);
    if (!r || r.status !== "queued") return false;
    r.status = "sending";
    return true;
  }
  async release(id: number) {
    const r = this.rows.get(id);
    if (r?.status === "sending") r.status = "queued";
  }
  async markSkipped(id: number, reason: string) {
    Object.assign(this.rows.get(id)!, { status: "skipped", skipReason: reason });
  }
  async markSent(id: number, waMessageId: string, sentAt: Date) {
    Object.assign(this.rows.get(id)!, { status: "sent", waMessageId, sentAt });
  }
  async markFailed(id: number, code: number | null) {
    Object.assign(this.rows.get(id)!, { status: "failed", errorCode: code });
  }
  async countMarketingSentSince(phone: string, since: Date) {
    return [...this.rows.values()].filter(
      (r) => r.phone === phone && r.category === "MARKETING" && r.sentAt && r.sentAt >= since,
    ).length;
  }
}

export class FakeTemplateStore implements TemplateStore {
  constructor(public templates: StoredTemplate[] = []) {}
  async getById(id: number) {
    return this.templates.find((t) => t.id === id) ?? null;
  }
  async getByName(name: string) {
    return this.templates.find((t) => t.name === name) ?? null;
  }
}

export class FakeConsentStore implements ConsentStore {
  records: Array<ConsentRecord & { phone: string; memberTicimaxId: number | null }> = [];
  async recordsFor(phone: string) {
    return this.records.filter((r) => r.phone === phone);
  }
  async append(record: ConsentRecord & { phone: string; memberTicimaxId: number | null }) {
    this.records.push(record);
  }
}

export class FakeWhatsApp implements WhatsAppSender {
  templatesSent: Array<Parameters<WhatsAppSender["sendTemplate"]>[0]> = [];
  textsSent: Array<{ to: string; text: string }> = [];
  nextError: Error | null = null;
  async sendTemplate(input: Parameters<WhatsAppSender["sendTemplate"]>[0]) {
    if (this.nextError) {
      const e = this.nextError;
      this.nextError = null;
      throw e;
    }
    this.templatesSent.push(input);
    return `wamid.${this.templatesSent.length}`;
  }
  async sendText(to: string, text: string) {
    this.textsSent.push({ to, text });
    return `wamid.text.${this.textsSent.length}`;
  }
}

export class FakeQueue implements MessageQueue {
  jobs: Array<{ messageId: number; delayMs?: number }> = [];
  async add(messageId: number, options?: { delayMs?: number }) {
    this.jobs.push({ messageId, delayMs: options?.delayMs });
  }
}

export class FakeInboundStore implements InboundStore {
  ids = new Set<string>();
  async insertIfAbsent(m: InboundMessage) {
    if (this.ids.has(m.waMessageId)) return false;
    this.ids.add(m.waMessageId);
    return true;
  }
}

export const fixedClock = (iso: string) => ({ now: () => new Date(iso) });
