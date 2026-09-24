/**
 * Meta WhatsApp Cloud API (Graph API) için ince istemci. SDK kullanılmaz; yalnızca
 * ihtiyaç duyulan uç noktalar vardır. Access token hiçbir zaman loglanmaz veya hata
 * mesajına eklenmez.
 */
export interface GraphClientConfig {
  apiVersion: string;
  phoneNumberId: string;
  businessAccountId: string;
  accessToken: string;
}

export class GraphApiError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly code: number | null,
    readonly title: string,
  ) {
    super(`Graph API hatası (HTTP ${httpStatus}${code !== null ? `, kod ${code}` : ""}): ${title}`);
  }

  /** Yeniden denenmesi anlamlı hatalar: ağ/sunucu hataları ve hız sınırı. */
  get retryable(): boolean {
    // 130429: hız sınırı, 131048: spam hız sınırı, 131056: aynı çifte çok sık mesaj, 131000/1/2: geçici hatalar.
    const retryableCodes = new Set([4, 80007, 130429, 131000, 131048, 131056, 1, 2]);
    return this.httpStatus >= 500 || this.httpStatus === 429 || (this.code !== null && retryableCodes.has(this.code));
  }
}

export interface SendTemplateInput {
  to: string;
  templateName: string;
  language: string;
  components: Array<Record<string, unknown>>;
}

export class GraphClient {
  private readonly baseUrl: string;

  constructor(
    private readonly config: GraphClientConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.baseUrl = `https://graph.facebook.com/${config.apiVersion}`;
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new GraphApiError(503, null, `Ağ hatası: ${(err as Error).name}`);
    }
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const error = (json.error ?? {}) as Record<string, unknown>;
      const code = typeof error.code === "number" ? error.code : null;
      const title = typeof error.message === "string" ? error.message : res.statusText;
      throw new GraphApiError(res.status, code, title);
    }
    return json as T;
  }

  /** Onaylı bir şablonla mesaj gönderir; Meta'nın mesaj id'sini (wamid) döner. */
  async sendTemplate(input: SendTemplateInput): Promise<string> {
    const res = await this.request<{ messages?: Array<{ id: string }> }>("POST", `${this.config.phoneNumberId}/messages`, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.to,
      type: "template",
      template: {
        name: input.templateName,
        language: { code: input.language },
        ...(input.components.length ? { components: input.components } : {}),
      },
    });
    const id = res.messages?.[0]?.id;
    if (!id) throw new GraphApiError(502, null, "Yanıtta mesaj id'si yok");
    return id;
  }

  /** Serbest metin mesajı. Yalnızca müşterinin son 24 saatte yazdığı konuşmalarda geçerlidir. */
  async sendText(to: string, text: string): Promise<string> {
    const res = await this.request<{ messages?: Array<{ id: string }> }>("POST", `${this.config.phoneNumberId}/messages`, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { body: text, preview_url: false },
    });
    const id = res.messages?.[0]?.id;
    if (!id) throw new GraphApiError(502, null, "Yanıtta mesaj id'si yok");
    return id;
  }

  /** Şablonu Meta onayına gönderir; Meta şablon id'sini ve ilk durumu döner. */
  async createTemplate(payload: Record<string, unknown>): Promise<{ id: string; status: string }> {
    return this.request<{ id: string; status: string }>(
      "POST",
      `${this.config.businessAccountId}/message_templates`,
      payload,
    );
  }
}
