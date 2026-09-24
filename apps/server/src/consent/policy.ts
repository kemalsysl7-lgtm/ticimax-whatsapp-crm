import type { TemplateCategory } from "../templates/triggers";

/**
 * İzin defteri ve gönderim politikası. Framework'ten bağımsızdır.
 *
 * İzin amaçları:
 *  - transactional: sipariş/kargo bildirimleri (UTILITY şablonlar)
 *  - marketing: kampanya, sepet hatırlatma, alarm, doğum günü (MARKETING şablonlar)
 *
 * İzin defteri yalnızca eklenerek büyür (append-only); bir amaç için geçerli durum,
 * o amaca ait en son kayıttır. Böylece her iznin ne zaman, hangi kaynaktan verildiği
 * veya geri alındığı kanıt olarak saklanır (İYS denetimi için).
 */
export type ConsentPurpose = "transactional" | "marketing";

export type ConsentSource =
  | "ticimax_sms_izin"
  | "whatsapp_inbound"
  | "whatsapp_stop"
  | "whatsapp_start"
  | "iys"
  | "manual";

export interface ConsentRecord {
  purpose: ConsentPurpose;
  granted: boolean;
  source: ConsentSource;
  createdAt: Date;
}

export interface ConsentState {
  transactional: boolean;
  marketing: boolean;
}

export function currentConsent(records: readonly ConsentRecord[]): ConsentState {
  const latest = (purpose: ConsentPurpose) =>
    records
      .filter((r) => r.purpose === purpose)
      .reduce<ConsentRecord | undefined>((acc, r) => (!acc || r.createdAt >= acc.createdAt ? r : acc), undefined);
  return {
    transactional: latest("transactional")?.granted ?? false,
    marketing: latest("marketing")?.granted ?? false,
  };
}

const STOP_WORDS = new Set(["DUR", "STOP", "IPTAL", "İPTAL", "ABONELIKTEN CIK", "ABONELİKTEN ÇIK"]);
const START_WORDS = new Set(["BASLA", "BAŞLA", "START"]);

function normalizeKeyword(text: string): string {
  return text.trim().toLocaleUpperCase("tr-TR").replace(/[.!]+$/, "");
}

export function isStopKeyword(text: string): boolean {
  return STOP_WORDS.has(normalizeKeyword(text));
}

export function isStartKeyword(text: string): boolean {
  return START_WORDS.has(normalizeKeyword(text));
}

export interface SendPolicyConfig {
  timezone: string;
  quietHoursStart: number;
  quietHoursEnd: number;
  marketingWeeklyCap: number;
}

export type SkipReason =
  | "no_phone"
  | "no_transactional_consent"
  | "no_marketing_consent"
  | "weekly_cap_reached";

export type PolicyDecision =
  | { action: "send" }
  | { action: "skip"; reason: SkipReason }
  | { action: "defer"; reason: "quiet_hours"; retryAt: Date };

export interface PolicyInput {
  category: TemplateCategory;
  phone: string | null;
  consent: ConsentState;
  /** Son 7 günde bu numaraya gönderilmiş marketing mesajı sayısı. */
  marketingSentLast7Days: number;
  now: Date;
}

function localTime(now: Date, timezone: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { hour: get("hour"), minute: get("minute") };
}

/** Sessiz saatteyse, sessiz saatin bitişine kalan dakika; değilse null. */
export function minutesUntilQuietHoursEnd(now: Date, config: SendPolicyConfig): number | null {
  const { quietHoursStart: start, quietHoursEnd: end } = config;
  if (start === end) return null;
  const { hour, minute } = localTime(now, config.timezone);
  const inQuiet = start > end ? hour >= start || hour < end : hour >= start && hour < end;
  if (!inQuiet) return null;
  return ((end - hour + 24) % 24) * 60 - minute;
}

export function evaluateSendPolicy(input: PolicyInput, config: SendPolicyConfig): PolicyDecision {
  if (!input.phone) return { action: "skip", reason: "no_phone" };

  if (input.category === "UTILITY") {
    return input.consent.transactional ? { action: "send" } : { action: "skip", reason: "no_transactional_consent" };
  }

  if (!input.consent.marketing) return { action: "skip", reason: "no_marketing_consent" };
  if (input.marketingSentLast7Days >= config.marketingWeeklyCap) return { action: "skip", reason: "weekly_cap_reached" };

  const wait = minutesUntilQuietHoursEnd(input.now, config);
  if (wait !== null) {
    return { action: "defer", reason: "quiet_hours", retryAt: new Date(input.now.getTime() + wait * 60_000) };
  }
  return { action: "send" };
}
