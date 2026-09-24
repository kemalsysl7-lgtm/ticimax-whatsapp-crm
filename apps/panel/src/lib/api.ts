import "server-only";
import { panelEnv } from "./env";
import type { MessageRow, TemplateInput, TemplateItem, TemplatePreviewResult, TriggerCatalog, ValidationIssue } from "./types";

/**
 * Sunucu API'sine yalnızca panel sunucusundan erişilir; ADMIN_API_TOKEN tarayıcıya gitmez.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues: ValidationIssue[] = [],
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const env = panelEnv();
  const res = await fetch(`${env.API_BASE_URL.replace(/\/$/, "")}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${env.ADMIN_API_TOKEN}`, "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = typeof json.message === "string" ? json.message : `Sunucu hatası (HTTP ${res.status})`;
    const issues = Array.isArray(json.issues) ? (json.issues as ValidationIssue[]) : [];
    throw new ApiError(res.status, message, issues);
  }
  return json as T;
}

export const api = {
  triggers: () => call<TriggerCatalog>("/admin/triggers"),
  templates: () => call<TemplateItem[]>("/admin/templates"),
  preview: (template: TemplateInput, values: Record<string, string> = {}) =>
    call<TemplatePreviewResult>("/admin/templates/preview", { method: "POST", body: { template, values } }),
  createTemplate: (template: TemplateInput) => call<TemplateItem>("/admin/templates", { method: "POST", body: template }),
  updateTemplate: (id: number, template: TemplateInput) =>
    call<TemplateItem>(`/admin/templates/${id}`, { method: "PUT", body: template }),
  submitTemplate: (id: number) => call<{ status: string }>(`/admin/templates/${id}/submit`, { method: "POST" }),
  messages: () => call<MessageRow[]>("/admin/messages"),
  testMessage: (body: { phone: string; templateName: string; variables: Record<string, string> }) =>
    call<{ messageId: number }>("/admin/messages/test", { method: "POST", body }),
  addConsent: (body: { phone: string; purpose: "transactional" | "marketing"; granted: boolean; note?: string }) =>
    call<{ ok: true }>("/admin/consents", { method: "POST", body }),
};
