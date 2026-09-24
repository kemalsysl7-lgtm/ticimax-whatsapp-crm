import type { ConsentRecord } from "../consent/policy";
import type { TemplateDefinition, VariableValues } from "../templates/template";
import type { TemplateCategory } from "../templates/triggers";

/**
 * Gönderim çekirdeğinin dış dünyaya bağımlılıkları. Üretimde Drizzle/BullMQ/Graph API
 * implementasyonları, testlerde bellek içi sahteleri kullanılır.
 */
export type TemplateStatus = "draft" | "pending" | "approved" | "rejected" | "paused" | "disabled";

export interface StoredTemplate extends TemplateDefinition {
  id: number;
  status: TemplateStatus;
}

export interface QueuedMessage {
  id: number;
  phone: string | null;
  category: TemplateCategory;
  templateId: number;
  variables: VariableValues;
  status: string;
}

export interface NewMessage {
  dedupeKey: string;
  phone: string | null;
  memberTicimaxId: number | null;
  templateId: number;
  category: TemplateCategory;
  variables: VariableValues;
  campaignId?: number | null;
}

export interface MessageStore {
  /** dedupeKey zaten varsa null döner (aynı olay ikinci kez mesaj üretmez). */
  insertIfAbsent(message: NewMessage): Promise<number | null>;
  get(id: number): Promise<QueuedMessage | null>;
  /** queued → sending geçişini atomik yapar; başka bir işçi zaten aldıysa false. */
  claim(id: number): Promise<boolean>;
  release(id: number): Promise<void>;
  markSkipped(id: number, reason: string): Promise<void>;
  markSent(id: number, waMessageId: string, sentAt: Date): Promise<void>;
  markFailed(id: number, code: number | null, message: string): Promise<void>;
  countMarketingSentSince(phone: string, since: Date): Promise<number>;
}

export interface TemplateStore {
  getById(id: number): Promise<StoredTemplate | null>;
  getByName(name: string): Promise<StoredTemplate | null>;
}

export interface ConsentStore {
  recordsFor(phone: string): Promise<ConsentRecord[]>;
  append(record: ConsentRecord & { phone: string; memberTicimaxId: number | null; evidence?: unknown }): Promise<void>;
}

export interface WhatsAppSender {
  sendTemplate(input: {
    to: string;
    templateName: string;
    language: string;
    components: Array<Record<string, unknown>>;
  }): Promise<string>;
  sendText(to: string, text: string): Promise<string>;
}

export interface MessageQueue {
  add(messageId: number, options?: { delayMs?: number }): Promise<void>;
}

export interface Clock {
  now(): Date;
}

export interface InboundMessage {
  waMessageId: string;
  phone: string;
  profileName: string | null;
  type: string;
  text: string | null;
  buttonText: string | null;
  receivedAt: Date;
}

export interface InboundStore {
  /** Aynı webhook tekrar gelirse false döner (Meta at-least-once teslim eder). */
  insertIfAbsent(message: InboundMessage): Promise<boolean>;
}
