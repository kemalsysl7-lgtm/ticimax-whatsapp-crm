import { and, eq, sql, type SQL } from "drizzle-orm";
import { AUTOMATIONS, parseSettings, type AutomationKey, type AutomationState } from "../automations/definitions";
import type { BotOrder } from "../chatbot/bot";
import { EXCLUDED_ORDER_STATUSES } from "../segments/rfm";
import type { Cart } from "../ticimax/mapper";
import type { Db } from "./client";
import { automations, carts, chatMessages, conversations, orders } from "./schema";

const excluded = sql.raw(EXCLUDED_ORDER_STATUSES.join(","));
type Row = Record<string, unknown>;

/** Otomasyonlar, sepetler ve gelen kutusu için veritabanı erişimi. */
export class AutomationQueries {
  constructor(private readonly db: Db) {}

  private async rows(query: SQL): Promise<Row[]> {
    return (await this.db.execute(query)) as unknown as Row[];
  }

  // ---- Otomasyon ayarları ----
  async getAutomation<K extends AutomationKey>(key: K): Promise<AutomationState<K>> {
    const row = await this.db.query.automations.findFirst({ where: eq(automations.key, key) });
    return { key, enabled: row?.enabled ?? false, templateName: row?.templateName ?? null, settings: parseSettings(key, row?.settings) };
  }

  async listAutomations(): Promise<AutomationState[]> {
    return Promise.all(AUTOMATIONS.map((a) => this.getAutomation(a.key)));
  }

  async saveAutomation(state: AutomationState): Promise<void> {
    await this.db
      .insert(automations)
      .values({ key: state.key, enabled: state.enabled, templateName: state.templateName, settings: state.settings })
      .onConflictDoUpdate({
        target: automations.key,
        set: { enabled: state.enabled, templateName: state.templateName, settings: state.settings, updatedAt: new Date() },
      });
  }

  // ---- Siparişler ----
  async setOrderShipment(orderId: number, info: { carrierName: string | null; trackingNo: string | null; trackingLink: string | null }) {
    await this.db
      .update(orders)
      .set({
        carrierName: info.carrierName,
        trackingLink: info.trackingLink,
        ...(info.trackingNo ? { trackingNo: info.trackingNo } : {}),
        updatedAt: new Date(),
      })
      .where(eq(orders.ticimaxId, orderId));
  }

  async getOrder(orderId: number) {
    return this.db.query.orders.findFirst({ where: eq(orders.ticimaxId, orderId) });
  }

  /** Bir telefona bağlı son siparişler: üyenin kayıtlı telefonu veya siparişin teslimat telefonu. */
  async ordersForPhone(phone: string, limit = 5): Promise<BotOrder[]> {
    const rows = await this.rows(sql`
      select o.ticimax_id, o.status_name, o.ordered_at, o.total, o.currency, o.carrier_name, o.tracking_no, o.tracking_link
      from orders o left join members m on m.ticimax_id = o.member_ticimax_id
      where m.phone = ${phone} or o.delivery_phone = ${phone}
      order by o.ordered_at desc nulls last limit ${limit}`);
    return rows.map((r) => ({
      id: Number(r.ticimax_id),
      statusName: String(r.status_name),
      orderedAt: r.ordered_at ? new Date(r.ordered_at as string) : null,
      total: Number(r.total),
      currency: String(r.currency),
      carrierName: (r.carrier_name as string | null) ?? null,
      trackingNo: (r.tracking_no as string | null) ?? null,
      trackingLink: (r.tracking_link as string | null) ?? null,
    }));
  }

  async member(id: number): Promise<{ firstName: string; phone: string | null } | null> {
    const [r] = await this.rows(sql`select first_name, phone from members where ticimax_id = ${id}`);
    return r ? { firstName: String(r.first_name ?? ""), phone: (r.phone as string | null) ?? null } : null;
  }

  async memberByPhone(phone: string): Promise<{ id: number; firstName: string } | null> {
    const [r] = await this.rows(sql`select ticimax_id, first_name from members where phone = ${phone} limit 1`);
    return r ? { id: Number(r.ticimax_id), firstName: String(r.first_name ?? "") } : null;
  }

  // ---- Sepetler ----
  async upsertCarts(list: Cart[]): Promise<void> {
    for (let i = 0; i < list.length; i += 500) {
      const chunk = list.slice(i, i + 500);
      if (!chunk.length) continue;
      await this.db
        .insert(carts)
        .values(chunk.map((c) => ({ cartId: c.cartId, memberTicimaxId: c.memberTicimaxId, cartUpdatedAt: c.updatedAt, items: c.items, total: c.total.toFixed(2) })))
        .onConflictDoUpdate({
          target: carts.cartId,
          set: {
            memberTicimaxId: sql`excluded.member_ticimax_id`,
            cartUpdatedAt: sql`excluded.cart_updated_at`,
            items: sql`excluded.items`,
            total: sql`excluded.total`,
            updatedAt: sql`now()`,
          },
        });
    }
  }

  /** Son `days` günde güncellenmiş, üyesi ve telefonu olan sepetler. */
  async recentMemberCarts(days: number) {
    const rows = await this.rows(sql`
      select c.cart_id, c.member_ticimax_id, c.cart_updated_at, c.items, c.total, m.first_name, m.phone,
             (select max(o.ordered_at) from orders o where o.member_ticimax_id = c.member_ticimax_id and o.status_code not in (${excluded})) as last_order_at
      from carts c join members m on m.ticimax_id = c.member_ticimax_id
      where c.cart_updated_at > now() - make_interval(days => ${days}::int) and m.phone is not null`);
    return rows.map((r) => ({
      cartId: Number(r.cart_id),
      memberTicimaxId: Number(r.member_ticimax_id),
      updatedAt: new Date(r.cart_updated_at as string),
      items: r.items as Cart["items"],
      total: Number(r.total),
      firstName: String(r.first_name ?? ""),
      phone: String(r.phone),
      lastOrderAt: r.last_order_at ? new Date(r.last_order_at as string) : null,
    }));
  }

  // ---- Alarmlar / doğum günü için kitle ----
  /** Pazarlama izni şu an açık, telefonlu üyeler (alarm sorgusu yalnızca bunlar için yapılır). */
  async marketingReachableMembers(): Promise<Array<{ id: number; firstName: string; phone: string }>> {
    const rows = await this.rows(sql`
      select m.ticimax_id, m.first_name, m.phone from members m
      where m.phone is not null
        and (select c.granted from consents c where c.phone = m.phone and c.purpose = 'marketing'
             order by c.created_at desc, c.id desc limit 1) is true
      order by m.ticimax_id`);
    return rows.map((r) => ({ id: Number(r.ticimax_id), firstName: String(r.first_name ?? ""), phone: String(r.phone) }));
  }

  async membersWithBirthday(month: number, day: number, includeFeb29: boolean) {
    const rows = await this.rows(sql`
      select ticimax_id, first_name, phone from members
      where phone is not null and birth_date is not null
        and ((extract(month from birth_date) = ${month} and extract(day from birth_date) = ${day})
             ${includeFeb29 ? sql`or (extract(month from birth_date) = 2 and extract(day from birth_date) = 29)` : sql``})`);
    return rows.map((r) => ({ id: Number(r.ticimax_id), firstName: String(r.first_name ?? ""), phone: String(r.phone) }));
  }

  // ---- Gelen kutusu ----
  async recordChat(input: {
    phone: string;
    direction: "in" | "out";
    author: "customer" | "bot" | "agent";
    text: string;
    waMessageId?: string | null;
    at: Date;
    memberTicimaxId?: number | null;
    profileName?: string | null;
  }): Promise<void> {
    await this.db.insert(chatMessages).values({
      phone: input.phone,
      direction: input.direction,
      author: input.author,
      text: input.text,
      waMessageId: input.waMessageId ?? null,
      createdAt: input.at,
    });
    const preview = input.text.slice(0, 120);
    await this.db
      .insert(conversations)
      .values({
        phone: input.phone,
        memberTicimaxId: input.memberTicimaxId ?? null,
        profileName: input.profileName ?? null,
        lastInboundAt: input.direction === "in" ? input.at : null,
        lastMessageAt: input.at,
        lastMessagePreview: preview,
      })
      .onConflictDoUpdate({
        target: conversations.phone,
        set: {
          lastMessageAt: input.at,
          lastMessagePreview: preview,
          ...(input.direction === "in" ? { lastInboundAt: input.at } : {}),
          ...(input.memberTicimaxId ? { memberTicimaxId: input.memberTicimaxId } : {}),
          ...(input.profileName ? { profileName: input.profileName } : {}),
        },
      });
  }

  async getConversation(phone: string) {
    return this.db.query.conversations.findFirst({ where: eq(conversations.phone, phone) });
  }

  async setNeedsHuman(phone: string, needsHuman: boolean): Promise<void> {
    await this.db.update(conversations).set({ needsHuman }).where(eq(conversations.phone, phone));
  }

  async botRepliesSince(phone: string, since: Date): Promise<number> {
    const [r] = await this.rows(sql`
      select count(*)::int as n from chat_messages where phone = ${phone} and author = 'bot' and created_at >= ${since.toISOString()}`);
    return Number(r?.n ?? 0);
  }

  async listConversations(onlyNeedsHuman: boolean) {
    const rows = await this.rows(sql`
      select c.phone, c.profile_name, c.needs_human, c.last_inbound_at, c.last_message_at, c.last_message_preview,
             m.ticimax_id as member_id, trim(coalesce(m.first_name, '') || ' ' || coalesce(m.last_name, '')) as member_name
      from conversations c left join members m on m.ticimax_id = c.member_ticimax_id
      ${onlyNeedsHuman ? sql`where c.needs_human` : sql``}
      order by c.needs_human desc, c.last_message_at desc limit 200`);
    return rows.map((r) => ({
      phone: String(r.phone),
      name: (r.member_name as string) || (r.profile_name as string | null) || null,
      memberId: r.member_id === null ? null : Number(r.member_id),
      needsHuman: r.needs_human === true,
      lastInboundAt: r.last_inbound_at ? new Date(r.last_inbound_at as string).toISOString() : null,
      lastMessageAt: new Date(r.last_message_at as string).toISOString(),
      preview: (r.last_message_preview as string | null) ?? "",
    }));
  }

  async chatHistory(phone: string) {
    const rows = await this.db.query.chatMessages.findMany({
      where: and(eq(chatMessages.phone, phone)),
      orderBy: (m, { asc }) => [asc(m.createdAt), asc(m.id)],
      limit: 300,
    });
    return rows.map((r) => ({ id: r.id, direction: r.direction, author: r.author, text: r.text, createdAt: r.createdAt.toISOString() }));
  }
}
