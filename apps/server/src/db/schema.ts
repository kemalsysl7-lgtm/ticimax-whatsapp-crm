import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/** Ticimax üyelerinin yerel kopyası (senkron ile güncellenir). */
export const members = pgTable(
  "members",
  {
    ticimaxId: integer("ticimax_id").primaryKey(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    birthDate: date("birth_date"),
    smsPermission: boolean("sms_permission").notNull(),
    mailPermission: boolean("mail_permission").notNull(),
    memberTypeId: integer("member_type_id"),
    ticimaxUpdatedAt: timestamp("ticimax_updated_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("members_phone_idx").on(t.phone)],
);

/** Ticimax siparişlerinin yerel kopyası. */
export const orders = pgTable(
  "orders",
  {
    ticimaxId: integer("ticimax_id").primaryKey(),
    memberTicimaxId: integer("member_ticimax_id"),
    statusCode: integer("status_code").notNull(),
    statusName: text("status_name").notNull(),
    customerName: text("customer_name").notNull(),
    deliveryPhone: text("delivery_phone"),
    total: numeric("total", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    orderedAt: timestamp("ordered_at", { withTimezone: true }),
    cargoCompanyId: integer("cargo_company_id"),
    trackingNo: text("tracking_no"),
    ...timestamps,
  },
  (t) => [index("orders_member_idx").on(t.memberTicimaxId), index("orders_delivery_phone_idx").on(t.deliveryPhone)],
);

/** Append-only izin defteri. Bir numara + amaç için geçerli durum = en son kayıt. */
export const consents = pgTable(
  "consents",
  {
    id: serial("id").primaryKey(),
    phone: text("phone").notNull(),
    memberTicimaxId: integer("member_ticimax_id"),
    purpose: text("purpose", { enum: ["transactional", "marketing"] }).notNull(),
    granted: boolean("granted").notNull(),
    source: text("source", {
      enum: ["ticimax_sms_izin", "whatsapp_inbound", "whatsapp_stop", "whatsapp_start", "iys", "manual"],
    }).notNull(),
    evidence: jsonb("evidence"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("consents_phone_idx").on(t.phone, t.purpose, t.createdAt)],
);

/** Mesaj şablonları (panelden yönetilir, Meta onayına gönderilir). */
export const templates = pgTable("templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  language: text("language").notNull().default("tr"),
  category: text("category", { enum: ["UTILITY", "MARKETING"] }).notNull(),
  trigger: text("trigger").notNull(),
  headerText: text("header_text"),
  body: text("body").notNull(),
  footer: text("footer"),
  buttons: jsonb("buttons").notNull().default([]),
  status: text("status", { enum: ["draft", "pending", "approved", "rejected", "paused", "disabled"] })
    .notNull()
    .default("draft"),
  metaTemplateId: text("meta_template_id"),
  rejectionReason: text("rejection_reason"),
  ...timestamps,
});

/**
 * Giden mesaj kaydı + gönderim kuyruğunun kaynağı. `dedupe_key` aynı iş olayının
 * (ör. "order:588:status:6") iki kez mesaj üretmesini engeller.
 */
export const messages = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    dedupeKey: text("dedupe_key").notNull(),
    phone: text("phone"),
    memberTicimaxId: integer("member_ticimax_id"),
    templateId: integer("template_id")
      .notNull()
      .references(() => templates.id),
    category: text("category", { enum: ["UTILITY", "MARKETING"] }).notNull(),
    variables: jsonb("variables").notNull(),
    status: text("status", { enum: ["queued", "sending", "skipped", "sent", "delivered", "read", "failed"] })
      .notNull()
      .default("queued"),
    skipReason: text("skip_reason"),
    waMessageId: text("wa_message_id"),
    errorCode: integer("error_code"),
    errorMessage: text("error_message"),
    pricingCategory: text("pricing_category"),
    campaignId: integer("campaign_id"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("messages_dedupe_key_uq").on(t.dedupeKey),
    uniqueIndex("messages_wa_message_id_uq").on(t.waMessageId),
    index("messages_phone_sent_idx").on(t.phone, t.category, t.sentAt),
    index("messages_member_idx").on(t.memberTicimaxId),
    index("messages_campaign_idx").on(t.campaignId),
  ],
);

/** Her müşterinin son hesaplanan RFM segmenti (gece + panelden elle yeniden hesaplanır). */
export const customerSegments = pgTable(
  "customer_segments",
  {
    memberTicimaxId: integer("member_ticimax_id").primaryKey(),
    segment: text("segment").notNull(),
    orderCount: integer("order_count").notNull(),
    totalSpent: numeric("total_spent", { precision: 14, scale: 2 }).notNull(),
    lastOrderAt: timestamp("last_order_at", { withTimezone: true }),
    recencyDays: integer("recency_days"),
    r: integer("r").notNull(),
    f: integer("f").notNull(),
    m: integer("m").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("customer_segments_segment_idx").on(t.segment)],
);

/** Bir segmente gönderilen toplu kampanya. Mesajlar `messages.campaign_id` ile bağlanır. */
export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  segment: text("segment").notNull(),
  templateId: integer("template_id")
    .notNull()
    .references(() => templates.id),
  variables: jsonb("variables").notNull(),
  audienceSize: integer("audience_size").notNull(),
  queuedCount: integer("queued_count").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Müşteriden gelen mesajlar (chatbot + 24 saatlik pencere takibi). */
export const inboundMessages = pgTable(
  "inbound_messages",
  {
    waMessageId: text("wa_message_id").primaryKey(),
    phone: text("phone").notNull(),
    profileName: text("profile_name"),
    type: text("type").notNull(),
    text: text("text"),
    buttonText: text("button_text"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("inbound_phone_idx").on(t.phone, t.receivedAt)],
);

/** Senkron işlerinin kaldığı yer (ör. son başarılı üye senkronunun zamanı). */
export const syncState = pgTable("sync_state", {
  key: text("key").primaryKey(),
  cursor: text("cursor").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
