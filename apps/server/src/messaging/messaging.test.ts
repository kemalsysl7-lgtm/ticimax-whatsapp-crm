import { beforeEach, describe, expect, it } from "vitest";
import { consentRecordsFromTicimax } from "../consent/ticimax-consent";
import { OPT_OUT_BUTTON_TEXT } from "../templates/template";
import { GraphApiError } from "../whatsapp/graph-client";
import {
  FakeConsentStore,
  FakeInboundStore,
  FakeMessageStore,
  FakeQueue,
  FakeTemplateStore,
  FakeWhatsApp,
  fixedClock,
} from "./fakes";
import { REPLY_OPTED_IN, REPLY_OPTED_OUT, handleInboundMessage } from "./inbound";
import type { StoredTemplate } from "./ports";
import { enqueueMessage, processQueuedMessage, type SendDeps } from "./send";

const PHONE = "905321234567";

const utility: StoredTemplate = {
  id: 1,
  name: "kargoya_verildi_v1",
  language: "tr",
  category: "UTILITY",
  trigger: "order_status",
  status: "approved",
  body: "Merhaba {{ad}}, {{siparis_no}} numaralı siparişin yola çıktı.",
  buttons: [],
};

const marketing: StoredTemplate = {
  id: 2,
  name: "fiyat_dustu_v1",
  language: "tr",
  category: "MARKETING",
  trigger: "price_drop",
  status: "approved",
  body: "Merhaba {{ad}}, {{urun_adi}} indirimde.",
  footer: "Mesaj almak istemiyorsanız DUR yazın",
  buttons: [{ type: "QUICK_REPLY", text: OPT_OUT_BUTTON_TEXT }],
};

let deps: SendDeps & {
  messages: FakeMessageStore;
  consents: FakeConsentStore;
  whatsapp: FakeWhatsApp;
  queue: FakeQueue;
  templates: FakeTemplateStore;
};

function grant(purpose: "transactional" | "marketing") {
  deps.consents.records.push({ phone: PHONE, memberTicimaxId: 42, purpose, granted: true, source: "manual", createdAt: new Date("2026-01-01") });
}

beforeEach(() => {
  deps = {
    messages: new FakeMessageStore(),
    templates: new FakeTemplateStore([utility, marketing]),
    consents: new FakeConsentStore(),
    whatsapp: new FakeWhatsApp(),
    queue: new FakeQueue(),
    clock: fixedClock("2026-09-24T12:00:00Z"), // 15:00 İstanbul
    policy: { timezone: "Europe/Istanbul", quietHoursStart: 21, quietHoursEnd: 9, marketingWeeklyCap: 2 },
  };
});

async function enqueue(templateName: string, dedupeKey: string, variables: Record<string, string>) {
  const r = await enqueueMessage(deps, { dedupeKey, phone: PHONE, memberTicimaxId: 42, templateName, variables });
  if (!r.created) throw new Error(r.reason);
  return r.messageId;
}

describe("enqueueMessage", () => {
  it("aynı olay için ikinci mesajı oluşturmaz", async () => {
    await enqueue("kargoya_verildi_v1", "order:588:status:6", { ad: "Ayşe", siparis_no: "588" });
    const second = await enqueueMessage(deps, {
      dedupeKey: "order:588:status:6",
      phone: PHONE,
      memberTicimaxId: 42,
      templateName: "kargoya_verildi_v1",
      variables: {},
    });
    expect(second).toEqual({ messageId: null, created: false, reason: "duplicate" });
    expect(deps.queue.jobs).toHaveLength(1);
  });

  it("bilinmeyen şablonda mesaj oluşturmaz", async () => {
    const r = await enqueueMessage(deps, { dedupeKey: "x", phone: PHONE, memberTicimaxId: null, templateName: "yok", variables: {} });
    expect(r).toEqual({ messageId: null, created: false, reason: "template_not_found" });
  });
});

describe("processQueuedMessage", () => {
  it("izin varsa utility mesajını gönderir", async () => {
    grant("transactional");
    const id = await enqueue("kargoya_verildi_v1", "k1", { ad: "Ayşe", siparis_no: "588" });
    await expect(processQueuedMessage(deps, id)).resolves.toEqual({ outcome: "sent", waMessageId: "wamid.1" });
    expect(deps.whatsapp.templatesSent[0]).toMatchObject({ to: PHONE, templateName: "kargoya_verildi_v1", language: "tr" });
    expect(deps.messages.rows.get(id)?.status).toBe("sent");
  });

  it("ikinci kez işlenirse tekrar göndermez", async () => {
    grant("transactional");
    const id = await enqueue("kargoya_verildi_v1", "k1", { ad: "Ayşe", siparis_no: "588" });
    await processQueuedMessage(deps, id);
    await expect(processQueuedMessage(deps, id)).resolves.toEqual({ outcome: "noop" });
    expect(deps.whatsapp.templatesSent).toHaveLength(1);
  });

  it("izin yoksa atlar ve göndermez", async () => {
    const id = await enqueue("fiyat_dustu_v1", "p1", { ad: "Ayşe", urun_adi: "Gömlek" });
    await expect(processQueuedMessage(deps, id)).resolves.toEqual({ outcome: "skipped", reason: "no_marketing_consent" });
    expect(deps.whatsapp.templatesSent).toHaveLength(0);
  });

  it("onaylanmamış şablonla göndermez", async () => {
    grant("transactional");
    deps.templates.templates[0] = { ...utility, status: "pending" };
    const id = await enqueue("kargoya_verildi_v1", "k1", { ad: "Ayşe", siparis_no: "588" });
    await expect(processQueuedMessage(deps, id)).resolves.toEqual({ outcome: "skipped", reason: "template_not_approved" });
  });

  it("eksik değişkende atlar", async () => {
    grant("transactional");
    const id = await enqueue("kargoya_verildi_v1", "k1", { ad: "Ayşe" });
    await expect(processQueuedMessage(deps, id)).resolves.toEqual({ outcome: "skipped", reason: "missing_variables:siparis_no" });
  });

  it("sessiz saatte marketing mesajını erteleyip kuyruğa geri koyar", async () => {
    grant("marketing");
    deps.clock = fixedClock("2026-09-24T20:30:00Z"); // 23:30 İstanbul
    const id = await enqueue("fiyat_dustu_v1", "p1", { ad: "Ayşe", urun_adi: "Gömlek" });
    const result = await processQueuedMessage(deps, id);
    expect(result).toEqual({ outcome: "deferred", retryAt: new Date("2026-09-25T06:00:00Z") });
    expect(deps.messages.rows.get(id)?.status).toBe("queued");
    expect(deps.queue.jobs.at(-1)).toEqual({ messageId: id, delayMs: 570 * 60_000 });
  });

  it("haftalık marketing üst sınırını uygular", async () => {
    grant("marketing");
    for (const key of ["a", "b", "c"]) {
      const id = await enqueue("fiyat_dustu_v1", key, { ad: "Ayşe", urun_adi: "Gömlek" });
      await processQueuedMessage(deps, id);
    }
    const statuses = [...deps.messages.rows.values()].map((r) => r.status);
    expect(statuses).toEqual(["sent", "sent", "skipped"]);
  });

  it("kalıcı Meta hatasında failed işaretler", async () => {
    grant("transactional");
    deps.whatsapp.nextError = new GraphApiError(400, 131026, "Message undeliverable");
    const id = await enqueue("kargoya_verildi_v1", "k1", { ad: "Ayşe", siparis_no: "588" });
    await expect(processQueuedMessage(deps, id)).resolves.toEqual({ outcome: "failed", code: 131026 });
    expect(deps.messages.rows.get(id)?.status).toBe("failed");
  });

  it("geçici hatada mesajı kuyruğa bırakıp hatayı fırlatır (yeniden denenir)", async () => {
    grant("transactional");
    deps.whatsapp.nextError = new GraphApiError(500, null, "Service unavailable");
    const id = await enqueue("kargoya_verildi_v1", "k1", { ad: "Ayşe", siparis_no: "588" });
    await expect(processQueuedMessage(deps, id)).rejects.toBeInstanceOf(GraphApiError);
    expect(deps.messages.rows.get(id)?.status).toBe("queued");
    await expect(processQueuedMessage(deps, id)).resolves.toMatchObject({ outcome: "sent" });
  });
});

describe("handleInboundMessage", () => {
  const inbound = (id: string, text: string | null, buttonText: string | null = null) => ({
    waMessageId: id,
    phone: PHONE,
    profileName: "Ayşe",
    type: buttonText ? "button" : "text",
    text,
    buttonText,
    receivedAt: new Date("2026-09-24T12:00:00Z"),
  });

  const inboundDeps = () => ({
    inbound: new FakeInboundStore(),
    consents: deps.consents,
    whatsapp: deps.whatsapp,
    clock: deps.clock,
    findMemberIdByPhone: async () => 42,
  });

  it("DUR yazınca tüm izinleri kapatır ve onay mesajı gönderir", async () => {
    grant("marketing");
    grant("transactional");
    const d = inboundDeps();
    await expect(handleInboundMessage(d, inbound("w1", " dur "))).resolves.toBe("opted_out");
    const latest = deps.consents.records.slice(-2);
    expect(latest.map((r) => [r.purpose, r.granted, r.source])).toEqual([
      ["marketing", false, "whatsapp_stop"],
      ["transactional", false, "whatsapp_stop"],
    ]);
    expect(deps.whatsapp.textsSent).toEqual([{ to: PHONE, text: REPLY_OPTED_OUT }]);
  });

  it("çıkış butonuna basılmasını DUR gibi işler", async () => {
    await expect(handleInboundMessage(inboundDeps(), inbound("w1", null, OPT_OUT_BUTTON_TEXT))).resolves.toBe("opted_out");
  });

  it("BAŞLA yazınca izinleri açar", async () => {
    await expect(handleInboundMessage(inboundDeps(), inbound("w1", "Başla"))).resolves.toBe("opted_in");
    expect(deps.consents.records.every((r) => r.granted && r.source === "whatsapp_start")).toBe(true);
    expect(deps.whatsapp.textsSent[0]?.text).toBe(REPLY_OPTED_IN);
  });

  it("aynı webhook ikinci kez gelirse tekrar işlemez", async () => {
    const d = inboundDeps();
    await handleInboundMessage(d, inbound("w1", "DUR"));
    await expect(handleInboundMessage(d, inbound("w1", "DUR"))).resolves.toBe("duplicate");
    expect(deps.whatsapp.textsSent).toHaveLength(1);
  });

  it("onay mesajı gönderilemese de çıkış iznini kaydeder", async () => {
    deps.whatsapp.sendText = async () => {
      throw new GraphApiError(500, null, "down");
    };
    await expect(handleInboundMessage(inboundDeps(), inbound("w1", "DUR"))).resolves.toBe("opted_out_reply_failed");
    expect(deps.consents.records.filter((r) => !r.granted)).toHaveLength(2);
  });

  it("normal mesajı sadece kaydeder", async () => {
    await expect(handleInboundMessage(inboundDeps(), inbound("w1", "Siparişim nerede?"))).resolves.toBe("stored");
    expect(deps.consents.records).toHaveLength(0);
  });
});

describe("consentRecordsFromTicimax", () => {
  const now = new Date("2026-09-24T12:00:00Z");

  it("ilk kez SmsIzin=true görülünce iki izni de açar", () => {
    expect(consentRecordsFromTicimax(true, [], now).map((r) => [r.purpose, r.granted])).toEqual([
      ["marketing", true],
      ["transactional", true],
    ]);
  });

  it("ilk kez SmsIzin=false görülünce kayıt eklemez", () => {
    expect(consentRecordsFromTicimax(false, [], now)).toEqual([]);
  });

  it("WhatsApp'ta DUR demiş müşteriye Ticimax değeri değişmedikçe izni geri açmaz", () => {
    const existing = [
      { purpose: "marketing" as const, granted: true, source: "ticimax_sms_izin" as const, createdAt: new Date("2026-01-01") },
      { purpose: "marketing" as const, granted: false, source: "whatsapp_stop" as const, createdAt: new Date("2026-05-01") },
    ];
    expect(consentRecordsFromTicimax(true, existing, now)).toEqual([]);
  });

  it("Ticimax'te izin kapanınca pazarlama iznini kapatır", () => {
    const existing = [{ purpose: "marketing" as const, granted: true, source: "ticimax_sms_izin" as const, createdAt: new Date("2026-01-01") }];
    expect(consentRecordsFromTicimax(false, existing, now)).toEqual([
      { purpose: "marketing", granted: false, source: "ticimax_sms_izin", createdAt: now },
    ]);
  });
});
