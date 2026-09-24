import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { GraphApiError, GraphClient } from "./graph-client";
import { verifyMetaSignature } from "./signature";
import { parseWebhook } from "./webhook-parser";

describe("verifyMetaSignature", () => {
  const secret = "app-secret";
  const body = Buffer.from('{"object":"whatsapp_business_account"}');
  const valid = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

  it("doğru imzayı kabul eder", () => expect(verifyMetaSignature(body, valid, secret)).toBe(true));
  it("yanlış secret'la üretilmiş imzayı reddeder", () =>
    expect(verifyMetaSignature(body, valid, "other-secret")).toBe(false));
  it("değiştirilmiş gövdeyi reddeder", () =>
    expect(verifyMetaSignature(Buffer.from("{}"), valid, secret)).toBe(false));
  it("eksik veya bozuk başlığı reddeder", () => {
    expect(verifyMetaSignature(body, undefined, secret)).toBe(false);
    expect(verifyMetaSignature(body, "sha1=abc", secret)).toBe(false);
    expect(verifyMetaSignature(body, "sha256=zz", secret)).toBe(false);
  });
});

describe("parseWebhook", () => {
  it("gelen metin mesajını ve buton yanıtını çözer", () => {
    const events = parseWebhook({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                contacts: [{ profile: { name: "Ayşe" }, wa_id: "905321234567" }],
                messages: [
                  { id: "wamid.1", from: "905321234567", timestamp: "1790000000", type: "text", text: { body: "Siparişim nerede?" } },
                  { id: "wamid.2", from: "905321234567", timestamp: "1790000001", type: "button", button: { text: "Bildirimleri kapat", payload: "x" } },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(events).toEqual([
      expect.objectContaining({ kind: "inbound_message", waMessageId: "wamid.1", from: "905321234567", profileName: "Ayşe", text: "Siparişim nerede?", buttonText: null }),
      expect.objectContaining({ kind: "inbound_message", waMessageId: "wamid.2", type: "button", text: null, buttonText: "Bildirimleri kapat" }),
    ]);
  });

  it("teslim durumlarını ve hata kodunu çözer, bilinmeyen durumları atlar", () => {
    const events = parseWebhook({
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                statuses: [
                  { id: "wamid.9", status: "delivered", timestamp: "1790000000", recipient_id: "905321234567", pricing: { category: "marketing" } },
                  { id: "wamid.10", status: "failed", timestamp: "1790000000", recipient_id: "905321234567", errors: [{ code: 131026, title: "Message undeliverable" }] },
                  { id: "wamid.11", status: "deleted", timestamp: "1790000000" },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(events).toEqual([
      expect.objectContaining({ kind: "status", waMessageId: "wamid.9", status: "delivered", pricingCategory: "marketing", errorCode: null }),
      expect.objectContaining({ kind: "status", waMessageId: "wamid.10", status: "failed", errorCode: 131026, errorTitle: "Message undeliverable" }),
    ]);
  });

  it("şablon onay güncellemesini çözer", () => {
    const events = parseWebhook({
      entry: [
        {
          changes: [
            {
              field: "message_template_status_update",
              value: { event: "REJECTED", message_template_id: 123, message_template_name: "fiyat_dustu_v1", reason: "INCORRECT_CATEGORY" },
            },
          ],
        },
      ],
    });
    expect(events).toEqual([
      { kind: "template_status", metaTemplateId: "123", templateName: "fiyat_dustu_v1", event: "REJECTED", reason: "INCORRECT_CATEGORY" },
    ]);
  });

  it("bozuk gövdede hata fırlatmaz", () => {
    expect(parseWebhook(null)).toEqual([]);
    expect(parseWebhook({ entry: "x" })).toEqual([]);
  });
});

describe("GraphClient", () => {
  const config = { apiVersion: "v23.0", phoneNumberId: "PN", businessAccountId: "WABA", accessToken: "secret-token" };

  it("şablon mesajını doğru uç noktaya gönderir ve wamid döner", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: "wamid.X" }] }), { status: 200 }));
    const client = new GraphClient(config, fetchMock as unknown as typeof fetch);
    const id = await client.sendTemplate({ to: "905321234567", templateName: "t", language: "tr", components: [] });
    expect(id).toBe("wamid.X");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v23.0/PN/messages");
    expect(JSON.parse(init.body as string)).toMatchObject({ to: "905321234567", type: "template", template: { name: "t", language: { code: "tr" } } });
  });

  it("Meta hatasını sınıflandırır ve token'ı mesaja koymaz", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: 131026, message: "Message undeliverable" } }), { status: 400 }),
    );
    const client = new GraphClient(config, fetchMock as unknown as typeof fetch);
    const err = await client.sendText("905321234567", "merhaba").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GraphApiError);
    expect((err as GraphApiError).retryable).toBe(false);
    expect((err as GraphApiError).message).not.toContain("secret-token");
  });

  it("hız sınırı ve sunucu hatalarını yeniden denenebilir sayar", () => {
    expect(new GraphApiError(400, 130429, "rate").retryable).toBe(true);
    expect(new GraphApiError(500, null, "x").retryable).toBe(true);
    expect(new GraphApiError(400, 132001, "template missing").retryable).toBe(false);
  });
});
