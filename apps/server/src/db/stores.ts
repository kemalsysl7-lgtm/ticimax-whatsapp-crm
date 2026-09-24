import { and, eq, gte, inArray, sql } from "drizzle-orm";
import type { ConsentRecord } from "../consent/policy";
import type {
  ConsentStore,
  InboundMessage,
  InboundStore,
  MessageStore,
  NewMessage,
  QueuedMessage,
  StoredTemplate,
  TemplateStatus,
  TemplateStore,
} from "../messaging/ports";
import type { TemplateButton, TemplateDefinition, VariableValues } from "../templates/template";
import type { TriggerType } from "../templates/triggers";
import type { Member, Order } from "../ticimax/mapper";
import type { Db } from "./client";
import { consents, inboundMessages, members, messages, orders, syncState, templates } from "./schema";

/** Port'ların Drizzle/PostgreSQL implementasyonları. */
export class DrizzleMessageStore implements MessageStore {
  constructor(private readonly db: Db) {}

  async insertIfAbsent(m: NewMessage): Promise<number | null> {
    const rows = await this.db
      .insert(messages)
      .values({ ...m, variables: m.variables })
      .onConflictDoNothing({ target: messages.dedupeKey })
      .returning({ id: messages.id });
    return rows[0]?.id ?? null;
  }

  async get(id: number): Promise<QueuedMessage | null> {
    const row = await this.db.query.messages.findFirst({ where: eq(messages.id, id) });
    if (!row) return null;
    return {
      id: row.id,
      phone: row.phone,
      category: row.category,
      templateId: row.templateId,
      variables: row.variables as VariableValues,
      status: row.status,
    };
  }

  async claim(id: number): Promise<boolean> {
    const rows = await this.db
      .update(messages)
      .set({ status: "sending", updatedAt: new Date() })
      .where(and(eq(messages.id, id), eq(messages.status, "queued")))
      .returning({ id: messages.id });
    return rows.length === 1;
  }

  async release(id: number): Promise<void> {
    await this.db
      .update(messages)
      .set({ status: "queued", updatedAt: new Date() })
      .where(and(eq(messages.id, id), eq(messages.status, "sending")));
  }

  async markSkipped(id: number, reason: string): Promise<void> {
    await this.db.update(messages).set({ status: "skipped", skipReason: reason, updatedAt: new Date() }).where(eq(messages.id, id));
  }

  async markSent(id: number, waMessageId: string, sentAt: Date): Promise<void> {
    await this.db.update(messages).set({ status: "sent", waMessageId, sentAt, updatedAt: new Date() }).where(eq(messages.id, id));
  }

  async markFailed(id: number, code: number | null, message: string): Promise<void> {
    await this.db
      .update(messages)
      .set({ status: "failed", errorCode: code, errorMessage: message.slice(0, 500), updatedAt: new Date() })
      .where(eq(messages.id, id));
  }

  async countMarketingSentSince(phone: string, since: Date): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(messages)
      .where(and(eq(messages.phone, phone), eq(messages.category, "MARKETING"), gte(messages.sentAt, since)));
    return row?.n ?? 0;
  }

  async listRecent(limit: number) {
    return this.db.query.messages.findMany({ orderBy: (m, { desc }) => [desc(m.id)], limit });
  }

  /** Meta teslim durumu webhook'u. Durum yalnızca ileri yönde güncellenir (read → delivered'a dönmez). */
  async applyDeliveryStatus(
    waMessageId: string,
    status: "sent" | "delivered" | "read" | "failed",
    info: { errorCode: number | null; errorTitle: string | null; pricingCategory: string | null },
  ): Promise<void> {
    const earlier: Record<typeof status, Array<"sending" | "sent" | "delivered" | "read">> = {
      sent: ["sending"],
      delivered: ["sending", "sent"],
      read: ["sending", "sent", "delivered"],
      failed: ["sending", "sent", "delivered"],
    };
    await this.db
      .update(messages)
      .set({
        status,
        updatedAt: new Date(),
        ...(info.pricingCategory ? { pricingCategory: info.pricingCategory } : {}),
        ...(status === "failed" ? { errorCode: info.errorCode, errorMessage: info.errorTitle } : {}),
      })
      .where(and(eq(messages.waMessageId, waMessageId), inArray(messages.status, earlier[status])));
  }
}

type TemplateRow = typeof templates.$inferSelect;

export function toStoredTemplate(row: TemplateRow): StoredTemplate {
  return {
    id: row.id,
    name: row.name,
    language: row.language,
    category: row.category,
    trigger: row.trigger as TriggerType,
    headerText: row.headerText,
    body: row.body,
    footer: row.footer,
    buttons: row.buttons as TemplateButton[],
    status: row.status,
  };
}

export class DrizzleTemplateStore implements TemplateStore {
  constructor(private readonly db: Db) {}

  async getById(id: number) {
    const row = await this.db.query.templates.findFirst({ where: eq(templates.id, id) });
    return row ? toStoredTemplate(row) : null;
  }

  async getByName(name: string) {
    const row = await this.db.query.templates.findFirst({ where: eq(templates.name, name) });
    return row ? toStoredTemplate(row) : null;
  }

  async list(): Promise<Array<StoredTemplate & { metaTemplateId: string | null; rejectionReason: string | null }>> {
    const rows = await this.db.query.templates.findMany({ orderBy: (t, { desc }) => [desc(t.updatedAt)] });
    return rows.map((r) => ({ ...toStoredTemplate(r), metaTemplateId: r.metaTemplateId, rejectionReason: r.rejectionReason }));
  }

  async create(def: TemplateDefinition): Promise<StoredTemplate> {
    const [row] = await this.db
      .insert(templates)
      .values({ ...def, headerText: def.headerText ?? null, footer: def.footer ?? null, buttons: def.buttons })
      .returning();
    return toStoredTemplate(row!);
  }

  async update(id: number, def: TemplateDefinition): Promise<StoredTemplate | null> {
    const [row] = await this.db
      .update(templates)
      .set({ ...def, headerText: def.headerText ?? null, footer: def.footer ?? null, buttons: def.buttons, updatedAt: new Date() })
      .where(eq(templates.id, id))
      .returning();
    return row ? toStoredTemplate(row) : null;
  }

  async setStatus(
    where: { id: number } | { metaTemplateId: string },
    status: TemplateStatus,
    extra: { metaTemplateId?: string; rejectionReason?: string | null } = {},
  ): Promise<void> {
    const condition = "id" in where ? eq(templates.id, where.id) : eq(templates.metaTemplateId, where.metaTemplateId);
    await this.db
      .update(templates)
      .set({ status, updatedAt: new Date(), ...extra })
      .where(condition);
  }
}

export class DrizzleConsentStore implements ConsentStore {
  constructor(private readonly db: Db) {}

  async recordsFor(phone: string): Promise<ConsentRecord[]> {
    const rows = await this.db.query.consents.findMany({ where: eq(consents.phone, phone) });
    return rows.map((r) => ({ purpose: r.purpose, granted: r.granted, source: r.source, createdAt: r.createdAt }));
  }

  async append(record: ConsentRecord & { phone: string; memberTicimaxId: number | null; evidence?: unknown }): Promise<void> {
    await this.db.insert(consents).values({
      phone: record.phone,
      memberTicimaxId: record.memberTicimaxId,
      purpose: record.purpose,
      granted: record.granted,
      source: record.source,
      evidence: record.evidence ?? null,
      createdAt: record.createdAt,
    });
  }
}

export class DrizzleInboundStore implements InboundStore {
  constructor(private readonly db: Db) {}

  async insertIfAbsent(m: InboundMessage): Promise<boolean> {
    const rows = await this.db
      .insert(inboundMessages)
      .values({ ...m })
      .onConflictDoNothing({ target: inboundMessages.waMessageId })
      .returning({ id: inboundMessages.waMessageId });
    return rows.length === 1;
  }
}

/** Ticimax kopyaları ve senkron imleci. */
export class DrizzleMirrorStore {
  constructor(private readonly db: Db) {}

  async upsertMembers(list: Member[]): Promise<void> {
    if (!list.length) return;
    await this.db
      .insert(members)
      .values(list.map(({ ticimaxId, updatedAt, ...rest }) => ({ ticimaxId, ...rest, ticimaxUpdatedAt: updatedAt })))
      .onConflictDoUpdate({
        target: members.ticimaxId,
        set: {
          firstName: sql`excluded.first_name`,
          lastName: sql`excluded.last_name`,
          email: sql`excluded.email`,
          phone: sql`excluded.phone`,
          birthDate: sql`excluded.birth_date`,
          smsPermission: sql`excluded.sms_permission`,
          mailPermission: sql`excluded.mail_permission`,
          memberTypeId: sql`excluded.member_type_id`,
          ticimaxUpdatedAt: sql`excluded.ticimax_updated_at`,
          updatedAt: sql`now()`,
        },
      });
  }

  /** Siparişleri yazar; durum kodu değişen siparişlerin eski ve yeni kodunu döner (bildirim için). */
  async upsertOrders(list: Order[]): Promise<Array<{ order: Order; previousStatus: number | null }>> {
    if (!list.length) return [];
    const existing = await this.db
      .select({ id: orders.ticimaxId, status: orders.statusCode })
      .from(orders)
      .where(inArray(orders.ticimaxId, list.map((o) => o.ticimaxId)));
    const previous = new Map(existing.map((r) => [r.id, r.status]));

    await this.db
      .insert(orders)
      .values(list.map((o) => ({ ...o, total: o.total.toFixed(2) })))
      .onConflictDoUpdate({
        target: orders.ticimaxId,
        set: {
          memberTicimaxId: sql`excluded.member_ticimax_id`,
          statusCode: sql`excluded.status_code`,
          statusName: sql`excluded.status_name`,
          customerName: sql`excluded.customer_name`,
          deliveryPhone: sql`excluded.delivery_phone`,
          total: sql`excluded.total`,
          currency: sql`excluded.currency`,
          orderedAt: sql`excluded.ordered_at`,
          cargoCompanyId: sql`excluded.cargo_company_id`,
          trackingNo: sql`excluded.tracking_no`,
          updatedAt: sql`now()`,
        },
      });

    return list
      .filter((o) => previous.get(o.ticimaxId) !== o.statusCode)
      .map((o) => ({ order: o, previousStatus: previous.get(o.ticimaxId) ?? null }));
  }

  async findMemberIdByPhone(phone: string): Promise<number | null> {
    const row = await this.db.query.members.findFirst({ where: eq(members.phone, phone), columns: { ticimaxId: true } });
    return row?.ticimaxId ?? null;
  }

  async getCursor(key: string): Promise<string | null> {
    const row = await this.db.query.syncState.findFirst({ where: eq(syncState.key, key) });
    return row?.cursor ?? null;
  }

  async setCursor(key: string, cursor: string): Promise<void> {
    await this.db
      .insert(syncState)
      .values({ key, cursor })
      .onConflictDoUpdate({ target: syncState.key, set: { cursor, updatedAt: new Date() } });
  }
}
