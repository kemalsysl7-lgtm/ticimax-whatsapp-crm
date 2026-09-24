import { sql, type SQL } from "drizzle-orm";
import { EXCLUDED_ORDER_STATUSES, type CustomerSegment, type CustomerStats } from "../segments/rfm";
import type { Db } from "./client";
import { customerSegments } from "./schema";

/**
 * Yönetim paneli için okuma sorguları ve segment yazımı. Tüm kullanıcı girdileri
 * parametre olarak geçer (SQL enjeksiyonuna kapalı).
 */
const excluded = sql.raw(EXCLUDED_ORDER_STATUSES.join(","));

export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

type Row = Record<string, unknown>;

const toNum = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const toDateOrNull = (v: unknown): string | null => (v ? new Date(v as string).toISOString() : null);

export class AdminQueries {
  constructor(private readonly db: Db) {}

  private async rows(query: SQL): Promise<Row[]> {
    return (await this.db.execute(query)) as unknown as Row[];
  }

  /** Her üye için geçerli sipariş sayısı, toplam harcama ve son sipariş tarihi. */
  async customerStats(): Promise<CustomerStats[]> {
    const rows = await this.rows(sql`
      select m.ticimax_id as id,
             count(o.ticimax_id)::int as order_count,
             coalesce(sum(o.total), 0) as total_spent,
             max(o.ordered_at) as last_order_at
      from members m
      left join orders o on o.member_ticimax_id = m.ticimax_id and o.status_code not in (${excluded})
      group by m.ticimax_id`);
    return rows.map((r) => ({
      memberTicimaxId: Number(r.id),
      orderCount: toNum(r.order_count),
      totalSpent: toNum(r.total_spent),
      lastOrderAt: r.last_order_at ? new Date(r.last_order_at as string) : null,
    }));
  }

  async saveSegments(list: CustomerSegment[], computedAt: Date): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(customerSegments);
      for (let i = 0; i < list.length; i += 1000) {
        await tx.insert(customerSegments).values(
          list.slice(i, i + 1000).map((s) => ({
            memberTicimaxId: s.memberTicimaxId,
            segment: s.segment,
            orderCount: s.orderCount,
            totalSpent: s.totalSpent.toFixed(2),
            lastOrderAt: s.lastOrderAt,
            recencyDays: s.recencyDays,
            r: s.r,
            f: s.f,
            m: s.m,
            computedAt,
          })),
        );
      }
    });
  }

  async segmentSummary() {
    const rows = await this.rows(sql`
      select s.segment,
             count(*)::int as customers,
             count(m.phone)::int as with_phone,
             coalesce(sum(s.total_spent), 0) as revenue,
             coalesce(avg(nullif(s.order_count, 0)), 0) as avg_orders,
             max(s.computed_at) as computed_at
      from customer_segments s
      join members m on m.ticimax_id = s.member_ticimax_id
      group by s.segment`);
    return rows.map((r) => ({
      segment: String(r.segment),
      customers: toNum(r.customers),
      withPhone: toNum(r.with_phone),
      revenue: toNum(r.revenue),
      avgOrders: Math.round(toNum(r.avg_orders) * 10) / 10,
      computedAt: toDateOrNull(r.computed_at),
    }));
  }

  async listCustomers(p: { q?: string; segment?: string; page: number; pageSize: number }) {
    const filters: SQL[] = [sql`true`];
    if (p.q) {
      const like = `%${escapeLike(p.q.trim())}%`;
      const digits = p.q.replace(/\D/g, "");
      filters.push(sql`(
        (m.first_name || ' ' || m.last_name) ilike ${like}
        or m.email ilike ${like}
        ${digits.length >= 4 ? sql`or m.phone like ${`%${escapeLike(digits)}%`}` : sql``}
      )`);
    }
    if (p.segment) filters.push(sql`s.segment = ${p.segment}`);
    const where = sql.join(filters, sql` and `);

    const [countRow] = await this.rows(sql`
      select count(*)::int as n from members m left join customer_segments s on s.member_ticimax_id = m.ticimax_id where ${where}`);
    const rows = await this.rows(sql`
      select m.ticimax_id as id, m.first_name, m.last_name, m.email, m.phone,
             s.segment, coalesce(s.order_count, 0) as order_count, coalesce(s.total_spent, 0) as total_spent,
             s.last_order_at,
             (select c.granted from consents c where c.phone = m.phone and c.purpose = 'transactional'
                order by c.created_at desc, c.id desc limit 1) as transactional,
             (select c.granted from consents c where c.phone = m.phone and c.purpose = 'marketing'
                order by c.created_at desc, c.id desc limit 1) as marketing
      from members m
      left join customer_segments s on s.member_ticimax_id = m.ticimax_id
      where ${where}
      order by s.last_order_at desc nulls last, m.ticimax_id desc
      limit ${p.pageSize} offset ${(p.page - 1) * p.pageSize}`);
    return {
      total: toNum(countRow?.n),
      items: rows.map((r) => ({
        id: Number(r.id),
        name: `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim(),
        email: (r.email as string | null) ?? null,
        phone: (r.phone as string | null) ?? null,
        segment: (r.segment as string | null) ?? null,
        orderCount: toNum(r.order_count),
        totalSpent: toNum(r.total_spent),
        lastOrderAt: toDateOrNull(r.last_order_at),
        consent: { transactional: r.transactional === true, marketing: r.marketing === true },
      })),
    };
  }

  async customerDetail(id: number) {
    const [member] = await this.rows(sql`
      select m.*, s.segment, s.order_count, s.total_spent, s.last_order_at, s.recency_days, s.r, s.f, s.m
      from members m left join customer_segments s on s.member_ticimax_id = m.ticimax_id
      where m.ticimax_id = ${id}`);
    if (!member) return null;
    const phone = (member.phone as string | null) ?? null;

    const orders = await this.rows(sql`
      select ticimax_id, status_code, status_name, total, currency, ordered_at, tracking_no
      from orders where member_ticimax_id = ${id} order by ordered_at desc nulls last limit 50`);
    const consents = phone
      ? await this.rows(sql`
          select purpose, granted, source, evidence, created_at from consents
          where phone = ${phone} order by created_at desc, id desc limit 100`)
      : [];
    const messages = await this.rows(sql`
      select m.id, t.name as template_name, m.category, m.status, m.skip_reason, m.error_message, m.created_at
      from messages m join templates t on t.id = m.template_id
      where m.member_ticimax_id = ${id} ${phone ? sql`or m.phone = ${phone}` : sql``}
      order by m.id desc limit 50`);

    const latest = (purpose: string) => consents.find((c) => c.purpose === purpose)?.granted === true;
    return {
      id,
      name: `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim(),
      email: member.email ?? null,
      phone,
      birthDate: member.birth_date ?? null,
      smsPermission: member.sms_permission === true,
      segment: member.segment
        ? {
            key: String(member.segment),
            orderCount: toNum(member.order_count),
            totalSpent: toNum(member.total_spent),
            lastOrderAt: toDateOrNull(member.last_order_at),
            recencyDays: member.recency_days === null ? null : toNum(member.recency_days),
            r: toNum(member.r),
            f: toNum(member.f),
            m: toNum(member.m),
          }
        : null,
      consent: { transactional: latest("transactional"), marketing: latest("marketing") },
      consentHistory: consents.map((c) => ({
        purpose: c.purpose,
        granted: c.granted === true,
        source: c.source,
        evidence: c.evidence ?? null,
        createdAt: toDateOrNull(c.created_at),
      })),
      orders: orders.map((o) => ({
        id: Number(o.ticimax_id),
        statusCode: toNum(o.status_code),
        statusName: o.status_name,
        total: toNum(o.total),
        currency: o.currency,
        orderedAt: toDateOrNull(o.ordered_at),
        trackingNo: o.tracking_no ?? null,
      })),
      messages: messages.map((m) => ({
        id: Number(m.id),
        templateName: m.template_name,
        category: m.category,
        status: m.status,
        skipReason: m.skip_reason ?? null,
        errorMessage: m.error_message ?? null,
        createdAt: toDateOrNull(m.created_at),
      })),
    };
  }

  async listOrders(p: { q?: string; status?: number; page: number; pageSize: number }) {
    const filters: SQL[] = [sql`true`];
    if (p.q) {
      const term = p.q.trim();
      const like = `%${escapeLike(term)}%`;
      filters.push(/^\d+$/.test(term)
        ? sql`(o.ticimax_id = ${Number(term)} or o.customer_name ilike ${like} or o.tracking_no ilike ${like})`
        : sql`(o.customer_name ilike ${like} or o.tracking_no ilike ${like})`);
    }
    if (p.status !== undefined) filters.push(sql`o.status_code = ${p.status}`);
    const where = sql.join(filters, sql` and `);
    const [countRow] = await this.rows(sql`select count(*)::int as n from orders o where ${where}`);
    const rows = await this.rows(sql`
      select o.ticimax_id, o.member_ticimax_id, o.customer_name, o.status_code, o.status_name, o.total, o.currency,
             o.ordered_at, o.tracking_no
      from orders o where ${where}
      order by o.ordered_at desc nulls last, o.ticimax_id desc
      limit ${p.pageSize} offset ${(p.page - 1) * p.pageSize}`);
    return {
      total: toNum(countRow?.n),
      items: rows.map((o) => ({
        id: Number(o.ticimax_id),
        memberId: o.member_ticimax_id === null ? null : Number(o.member_ticimax_id),
        customerName: o.customer_name,
        statusCode: toNum(o.status_code),
        statusName: o.status_name,
        total: toNum(o.total),
        currency: o.currency,
        orderedAt: toDateOrNull(o.ordered_at),
        trackingNo: o.tracking_no ?? null,
      })),
    };
  }

  /** Kampanya kitlesi: segmentteki, telefonu olan üyeler. İzin kontrolü gönderim anında yapılır. */
  async segmentAudience(segment: string): Promise<Array<{ memberTicimaxId: number; firstName: string; phone: string }>> {
    const rows = await this.rows(sql`
      select m.ticimax_id, m.first_name, m.phone from customer_segments s
      join members m on m.ticimax_id = s.member_ticimax_id
      where s.segment = ${segment} and m.phone is not null`);
    return rows.map((r) => ({ memberTicimaxId: Number(r.ticimax_id), firstName: String(r.first_name ?? ""), phone: String(r.phone) }));
  }

  /** Segmentte pazarlama izni şu an açık olan (telefonlu) üye sayısı — kampanya öncesi tahmin için. */
  async segmentReach(segment: string): Promise<{ withPhone: number; withMarketingConsent: number }> {
    const [row] = await this.rows(sql`
      select count(*)::int as with_phone,
             count(*) filter (where (select c.granted from consents c where c.phone = m.phone and c.purpose = 'marketing'
                                     order by c.created_at desc, c.id desc limit 1) is true)::int as with_consent
      from customer_segments s join members m on m.ticimax_id = s.member_ticimax_id
      where s.segment = ${segment} and m.phone is not null`);
    return { withPhone: toNum(row?.with_phone), withMarketingConsent: toNum(row?.with_consent) };
  }

  async listCampaigns() {
    const rows = await this.rows(sql`
      select c.id, c.name, c.segment, c.audience_size, c.queued_count, c.created_at, t.name as template_name,
             count(m.id) filter (where m.status in ('sent','delivered','read'))::int as sent,
             count(m.id) filter (where m.status in ('delivered','read'))::int as delivered,
             count(m.id) filter (where m.status = 'read')::int as read,
             count(m.id) filter (where m.status = 'skipped')::int as skipped,
             count(m.id) filter (where m.status = 'failed')::int as failed,
             count(m.id) filter (where m.status in ('queued','sending'))::int as pending
      from campaigns c join templates t on t.id = c.template_id
      left join messages m on m.campaign_id = c.id
      group by c.id, t.name order by c.id desc limit 100`);
    return rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
      segment: r.segment,
      templateName: r.template_name,
      audienceSize: toNum(r.audience_size),
      queued: toNum(r.queued_count),
      sent: toNum(r.sent),
      delivered: toNum(r.delivered),
      read: toNum(r.read),
      skipped: toNum(r.skipped),
      failed: toNum(r.failed),
      pending: toNum(r.pending),
      createdAt: toDateOrNull(r.created_at),
    }));
  }
}
