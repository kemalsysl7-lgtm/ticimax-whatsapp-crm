import { describe, expect, it } from "vitest";
import {
  currentConsent,
  evaluateSendPolicy,
  isStartKeyword,
  isStopKeyword,
  minutesUntilQuietHoursEnd,
  type ConsentRecord,
  type SendPolicyConfig,
} from "./policy";

const config: SendPolicyConfig = {
  timezone: "Europe/Istanbul",
  quietHoursStart: 21,
  quietHoursEnd: 9,
  marketingWeeklyCap: 2,
};

// İstanbul UTC+3: 12:00 UTC = 15:00 yerel, 20:30 UTC = 23:30 yerel.
const afternoon = new Date("2026-09-24T12:00:00Z");
const lateNight = new Date("2026-09-24T20:30:00Z");

const full = { transactional: true, marketing: true };

describe("currentConsent", () => {
  it("her amaç için en son kaydı esas alır", () => {
    const records: ConsentRecord[] = [
      { purpose: "marketing", granted: true, source: "ticimax_sms_izin", createdAt: new Date("2026-01-01") },
      { purpose: "marketing", granted: false, source: "whatsapp_stop", createdAt: new Date("2026-05-01") },
      { purpose: "transactional", granted: true, source: "whatsapp_inbound", createdAt: new Date("2026-02-01") },
    ];
    expect(currentConsent(records)).toEqual({ transactional: true, marketing: false });
  });

  it("kayıt yoksa izin yoktur", () => {
    expect(currentConsent([])).toEqual({ transactional: false, marketing: false });
  });
});

describe("anahtar kelimeler", () => {
  it.each(["DUR", "dur", " Dur. ", "iptal", "İPTAL", "stop"])("çıkış: %s", (w) => expect(isStopKeyword(w)).toBe(true));
  it.each(["başla", "BASLA", "start"])("tekrar başlatma: %s", (w) => expect(isStartKeyword(w)).toBe(true));
  it("normal mesaj anahtar kelime değildir", () => expect(isStopKeyword("siparişim nerede")).toBe(false));
});

describe("minutesUntilQuietHoursEnd", () => {
  it("gündüz sessiz saatte değildir", () => expect(minutesUntilQuietHoursEnd(afternoon, config)).toBeNull());
  it("23:30'da 09:00'a 570 dakika kalır", () => expect(minutesUntilQuietHoursEnd(lateNight, config)).toBe(570));
  it("başlangıç ve bitiş aynıysa sessiz saat yoktur", () =>
    expect(minutesUntilQuietHoursEnd(lateNight, { ...config, quietHoursEnd: 21 })).toBeNull());
});

describe("evaluateSendPolicy", () => {
  const base = { phone: "905321234567", consent: full, marketingSentLast7Days: 0, now: afternoon };

  it("telefon yoksa atlar", () => {
    expect(evaluateSendPolicy({ ...base, category: "UTILITY", phone: null }, config)).toEqual({
      action: "skip",
      reason: "no_phone",
    });
  });

  it("utility mesajı sessiz saatte de gönderilir", () => {
    expect(evaluateSendPolicy({ ...base, category: "UTILITY", now: lateNight }, config)).toEqual({ action: "send" });
  });

  it("utility mesajı transactional izin ister", () => {
    const decision = evaluateSendPolicy(
      { ...base, category: "UTILITY", consent: { transactional: false, marketing: true } },
      config,
    );
    expect(decision).toEqual({ action: "skip", reason: "no_transactional_consent" });
  });

  it("marketing mesajı marketing izni ister", () => {
    const decision = evaluateSendPolicy(
      { ...base, category: "MARKETING", consent: { transactional: true, marketing: false } },
      config,
    );
    expect(decision).toEqual({ action: "skip", reason: "no_marketing_consent" });
  });

  it("haftalık üst sınır dolduysa atlar", () => {
    expect(evaluateSendPolicy({ ...base, category: "MARKETING", marketingSentLast7Days: 2 }, config)).toEqual({
      action: "skip",
      reason: "weekly_cap_reached",
    });
  });

  it("marketing mesajını sessiz saatte ertesi sabaha erteler", () => {
    const decision = evaluateSendPolicy({ ...base, category: "MARKETING", now: lateNight }, config);
    expect(decision).toEqual({
      action: "defer",
      reason: "quiet_hours",
      retryAt: new Date("2026-09-25T06:00:00Z"), // 09:00 İstanbul
    });
  });

  it("koşullar uygunsa marketing mesajı gönderilir", () => {
    expect(evaluateSendPolicy({ ...base, category: "MARKETING" }, config)).toEqual({ action: "send" });
  });
});
