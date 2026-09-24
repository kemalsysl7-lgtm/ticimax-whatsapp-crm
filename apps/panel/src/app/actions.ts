"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ApiError, api, automationApi } from "@/lib/api";
import { panelEnv } from "@/lib/env";
import { endSession, requireSession, startSession } from "@/lib/session";
import { LoginRateLimiter, passwordMatches } from "@/lib/session-token";
import type { TemplateInput, TemplatePreviewResult, ValidationIssue } from "@/lib/types";

const loginLimiter = new LoginRateLimiter();

export async function loginAction(_: { error: string | null }, form: FormData): Promise<{ error: string | null }> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  if (loginLimiter.isBlocked(ip)) return { error: "Çok fazla hatalı deneme. 15 dakika sonra tekrar deneyin." };

  const password = String(form.get("password") ?? "");
  if (!passwordMatches(password, panelEnv().PANEL_PASSWORD)) {
    loginLimiter.recordFailure(ip);
    return { error: "Şifre hatalı." };
  }
  loginLimiter.reset(ip);
  await startSession();
  redirect("/segments");
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; issues: ValidationIssue[] };

function fail(err: unknown): { ok: false; error: string; issues: ValidationIssue[] } {
  if (err instanceof ApiError) return { ok: false, error: err.message, issues: err.issues };
  return { ok: false, error: "Beklenmeyen bir hata oluştu.", issues: [] };
}

export async function previewAction(template: TemplateInput): Promise<ActionResult<TemplatePreviewResult>> {
  await requireSession();
  try {
    return { ok: true, data: await api.preview(template) };
  } catch (err) {
    return fail(err);
  }
}

export async function saveTemplateAction(id: number | null, template: TemplateInput): Promise<ActionResult<{ id: number }>> {
  await requireSession();
  try {
    const saved = id === null ? await api.createTemplate(template) : await api.updateTemplate(id, template);
    revalidatePath("/templates");
    return { ok: true, data: { id: saved.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function submitTemplateAction(id: number): Promise<ActionResult<{ status: string }>> {
  await requireSession();
  try {
    const result = await api.submitTemplate(id);
    revalidatePath("/templates");
    return { ok: true, data: result };
  } catch (err) {
    return fail(err);
  }
}

export async function testMessageAction(
  _: ActionResult<{ messageId: number }> | null,
  form: FormData,
): Promise<ActionResult<{ messageId: number }>> {
  await requireSession();
  const variables: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (key.startsWith("var_")) variables[key.slice(4)] = String(value);
  }
  try {
    const data = await api.testMessage({
      phone: String(form.get("phone") ?? ""),
      templateName: String(form.get("templateName") ?? ""),
      variables,
    });
    revalidatePath("/messages");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function addConsentAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireSession();
  try {
    await api.addConsent({
      phone: String(form.get("phone") ?? ""),
      purpose: form.get("purpose") === "marketing" ? "marketing" : "transactional",
      granted: form.get("granted") === "true",
      note: String(form.get("note") ?? "") || undefined,
    });
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

export async function saveAutomationAction(
  key: string,
  body: { enabled: boolean; templateName: string | null; settings: Record<string, unknown> },
): Promise<ActionResult> {
  await requireSession();
  try {
    await automationApi.save(key, body);
    revalidatePath("/automations");
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

export async function runAutomationsNowAction(): Promise<ActionResult> {
  await requireSession();
  try {
    await automationApi.runNow();
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

export async function replyAction(phone: string, text: string): Promise<ActionResult> {
  await requireSession();
  try {
    await automationApi.reply(phone, text);
    revalidatePath(`/inbox/${phone}`);
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

export async function resolveConversationAction(phone: string): Promise<void> {
  await requireSession();
  await automationApi.resolve(phone);
  revalidatePath("/inbox");
  revalidatePath(`/inbox/${phone}`);
}

export async function recomputeSegmentsAction(): Promise<void> {
  await requireSession();
  await api.recomputeSegments();
  revalidatePath("/segments");
}

export async function segmentReachAction(segment: string): Promise<ActionResult<{ withPhone: number; withMarketingConsent: number }>> {
  await requireSession();
  try {
    return { ok: true, data: await api.segmentReach(segment) };
  } catch (err) {
    return fail(err);
  }
}

export async function launchCampaignAction(input: {
  name: string;
  segment: string;
  templateName: string;
  variables: Record<string, string>;
}): Promise<ActionResult<{ campaignId: number; queued: number }>> {
  await requireSession();
  try {
    const data = await api.launchCampaign(input);
    revalidatePath("/campaigns");
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}
