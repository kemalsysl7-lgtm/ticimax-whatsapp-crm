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
