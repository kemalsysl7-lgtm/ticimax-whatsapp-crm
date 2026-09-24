/** Sunucu API'sinin panelde kullanılan yanıt şekilleri. */
export type TemplateCategory = "UTILITY" | "MARKETING";
export type TemplateStatus = "draft" | "pending" | "approved" | "rejected" | "paused" | "disabled";

export type TemplateButton = { type: "URL"; text: string; url: string } | { type: "QUICK_REPLY"; text: string };

export interface TemplateInput {
  name: string;
  language: string;
  category: TemplateCategory;
  trigger: string;
  headerText: string | null;
  body: string;
  footer: string | null;
  buttons: TemplateButton[];
}

export interface TemplateItem extends TemplateInput {
  id: number;
  status: TemplateStatus;
  metaTemplateId?: string | null;
  rejectionReason?: string | null;
}

export interface VariableDef {
  key: string;
  label: string;
  example: string;
}

export type TriggerCatalog = Record<string, { label: string; defaultCategory: TemplateCategory; variables: VariableDef[] }>;

export interface ValidationIssue {
  field: string;
  message: string;
}

export interface TemplatePreview {
  header: string | null;
  body: string;
  footer: string | null;
  buttons: Array<{ type: "URL" | "QUICK_REPLY"; text: string; url?: string }>;
}

export interface TemplatePreviewResult {
  issues: ValidationIssue[];
  preview: TemplatePreview;
}

export interface MessageRow {
  id: number;
  phone: string | null;
  templateId: number;
  category: TemplateCategory;
  status: string;
  skipReason: string | null;
  errorMessage: string | null;
  createdAt: string;
  sentAt: string | null;
}

export const STATUS_LABELS: Record<TemplateStatus, string> = {
  draft: "Taslak",
  pending: "Onay bekliyor",
  approved: "Onaylandı",
  rejected: "Reddedildi",
  paused: "Durduruldu",
  disabled: "Devre dışı",
};

export const MESSAGE_STATUS_LABELS: Record<string, string> = {
  queued: "Kuyrukta",
  sending: "Gönderiliyor",
  skipped: "Atlandı",
  sent: "Gönderildi",
  delivered: "İletildi",
  read: "Okundu",
  failed: "Başarısız",
};

export const SKIP_REASON_LABELS: Record<string, string> = {
  template_not_approved: "Şablon onaylı değil",
  no_phone: "Telefon yok",
  no_transactional_consent: "Bilgilendirme izni yok",
  no_marketing_consent: "Pazarlama izni yok",
  weekly_cap_reached: "Haftalık sınır doldu",
};

export interface Paged<T> {
  total: number;
  page: number;
  pageSize: number;
  items: T[];
}

export interface CustomerRow {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  segment: string | null;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
  consent: { transactional: boolean; marketing: boolean };
}

export interface CustomerDetail {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  birthDate: string | null;
  smsPermission: boolean;
  segment: { key: string; orderCount: number; totalSpent: number; lastOrderAt: string | null; recencyDays: number | null; r: number; f: number; m: number } | null;
  consent: { transactional: boolean; marketing: boolean };
  consentHistory: Array<{ purpose: string; granted: boolean; source: string; evidence: { note?: string; text?: string } | null; createdAt: string | null }>;
  orders: Array<{ id: number; statusCode: number; statusName: string; total: number; currency: string; orderedAt: string | null; trackingNo: string | null }>;
  messages: Array<{ id: number; templateName: string; category: string; status: string; skipReason: string | null; errorMessage: string | null; createdAt: string | null }>;
}

export interface OrderRow {
  id: number;
  memberId: number | null;
  customerName: string;
  statusCode: number;
  statusName: string;
  total: number;
  currency: string;
  orderedAt: string | null;
  trackingNo: string | null;
}

export interface SegmentInfo {
  key: string;
  label: string;
  description: string;
  action: string;
  customers: number;
  withPhone: number;
  revenue: number;
  avgOrders: number;
}

export interface SegmentOverview {
  computedAt: string | null;
  segments: SegmentInfo[];
}

export interface CampaignRow {
  id: number;
  name: string;
  segment: string;
  templateName: string;
  audienceSize: number;
  queued: number;
  sent: number;
  delivered: number;
  read: number;
  skipped: number;
  failed: number;
  pending: number;
  createdAt: string | null;
}

/** Segment renk tonları (durum göstergesi; vurgu renginden ayrı). */
export const SEGMENT_TONES: Record<string, string> = {
  champions: "bg-emerald-100 text-emerald-800",
  loyal: "bg-teal-100 text-teal-800",
  potential_loyal: "bg-sky-100 text-sky-800",
  new: "bg-indigo-100 text-indigo-800",
  one_time: "bg-slate-100 text-slate-700",
  at_risk: "bg-amber-100 text-amber-800",
  sleeping: "bg-orange-100 text-orange-800",
  lost: "bg-red-100 text-red-800",
  needs_attention: "bg-yellow-100 text-yellow-800",
  no_orders: "bg-slate-100 text-slate-500",
};

export const CONSENT_SOURCE_LABELS: Record<string, string> = {
  ticimax_sms_izin: "Ticimax SMS izni",
  whatsapp_inbound: "WhatsApp mesajı",
  whatsapp_stop: "WhatsApp: DUR",
  whatsapp_start: "WhatsApp: BAŞLA",
  iys: "İYS",
  manual: "Elle",
};

export const ORDER_STATUS_OPTIONS: Array<[number, string]> = [
  [0, "Ön sipariş"], [1, "Onay bekliyor"], [2, "Onaylandı"], [3, "Ödeme bekliyor"], [4, "Paketleniyor"],
  [5, "Tedarik ediliyor"], [6, "Kargoya verildi"], [7, "Teslim edildi"], [8, "İptal edildi"], [9, "İade edildi"],
  [11, "İade talebi alındı"], [14, "Teslimat öncesi iptal talebi"], [15, "İptal talebi"], [16, "Kısmi iade talebi"], [17, "Kısmi iade yapıldı"],
];
