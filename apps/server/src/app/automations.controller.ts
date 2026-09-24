import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { AUTOMATIONS, AUTOMATION_KEYS, SETTINGS_SCHEMAS, type AutomationKey, type AutomationState } from "../automations/definitions";
import { verifyTrackingRef } from "../automations/tracking-link";
import { normalizeTrMobile } from "../common/phone";
import { extractVariables } from "../templates/template";
import { AdminGuard } from "./admin.guard";
import { BackgroundJobs } from "./background";
import { CONTAINER, type Container } from "./container";

/** Otomasyonun kendisinin doldurduğu değişkenler; kalanlar ayarlardan gelmeli. */
const AUTO_VARIABLES: Record<AutomationKey, string[]> = {
  order_confirmed: ["ad", "siparis_no", "durum", "kargo_firmasi", "takip_no", "takip_yolu"],
  order_shipped: ["ad", "siparis_no", "durum", "kargo_firmasi", "takip_no", "takip_yolu"],
  order_delivered: ["ad", "siparis_no", "durum", "kargo_firmasi", "takip_no", "takip_yolu"],
  abandoned_cart: ["ad", "urun_sayisi", "ilk_urun_adi", "sepet_toplami", "sepet_yolu", "kupon_kodu"],
  price_drop: ["ad", "urun_adi", "eski_fiyat", "yeni_fiyat", "indirim_yuzdesi", "urun_yolu"],
  back_in_stock: ["ad", "urun_adi", "urun_yolu"],
  birthday: ["ad", "kupon_kodu", "kupon_bitis"],
  chatbot: [],
};

const saveSchema = z.object({
  enabled: z.boolean(),
  templateName: z.string().min(1).nullable().default(null),
  settings: z.unknown().default({}),
});

const replySchema = z.object({ text: z.string().trim().min(1).max(4096) });

@Controller("admin")
@UseGuards(AdminGuard)
export class AutomationsController {
  constructor(
    @Inject(CONTAINER) private readonly c: Container,
    private readonly jobs: BackgroundJobs,
  ) {}

  @Get("automations")
  async list() {
    const [states, templates] = await Promise.all([this.c.automationQueries.listAutomations(), this.c.stores.templates.list()]);
    return AUTOMATIONS.map((def) => ({
      ...def,
      state: states.find((s) => s.key === def.key),
      templates: templates.filter((t) => t.trigger === def.trigger).map((t) => ({ name: t.name, status: t.status })),
    }));
  }

  @Put("automations/:key")
  async save(@Param("key") key: string, @Body() body: unknown) {
    if (!(AUTOMATION_KEYS as string[]).includes(key)) throw new NotFoundException("Bilinmeyen otomasyon");
    const k = key as AutomationKey;
    const def = AUTOMATIONS.find((a) => a.key === k)!;
    const input = saveSchema.safeParse(body);
    if (!input.success) throw new BadRequestException("Geçersiz istek");
    const settings = SETTINGS_SCHEMAS[k].safeParse(input.data.settings ?? {});
    if (!settings.success) {
      throw new BadRequestException({ message: "Ayarlar geçersiz", issues: settings.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) });
    }

    const templateName = def.trigger ? input.data.templateName : null;
    if (templateName) {
      const template = await this.c.stores.templates.getByName(templateName);
      if (!template || template.trigger !== def.trigger) throw new BadRequestException("Bu otomasyonla uyumlu bir şablon seçin.");
      if (input.data.enabled && template.status !== "approved") {
        throw new BadRequestException("Otomasyonu açmak için şablonun Meta tarafından onaylanmış olması gerekir.");
      }
      const used = new Set([
        ...extractVariables(template.headerText ?? ""),
        ...extractVariables(template.body),
        ...template.buttons.flatMap((b) => (b.type === "URL" ? extractVariables(b.url) : [])),
      ]);
      const unsupported = [...used].filter((v) => !AUTO_VARIABLES[k].includes(v));
      if (unsupported.length) throw new BadRequestException(`Bu otomasyon şu değişkenleri dolduramaz: ${unsupported.join(", ")}`);
      if (input.data.enabled && used.has("kupon_kodu")) {
        const s = settings.data as Record<string, unknown>;
        const missingCoupon =
          k === "abandoned_cart"
            ? (s.delaysHours as number[]).some((_, i) => !String((s.couponCodes as string[])[i] ?? "").trim())
            : k === "birthday" && !String(s.couponCode ?? "").trim();
        if (missingCoupon) throw new BadRequestException("Şablon kupon kodu kullanıyor; ayarlarda kupon kodunu girin.");
      }
    } else if (input.data.enabled && def.trigger) {
      throw new BadRequestException("Otomasyonu açmak için bir şablon seçin.");
    }

    const state: AutomationState = { key: k, enabled: input.data.enabled, templateName, settings: settings.data as never };
    await this.c.automationQueries.saveAutomation(state);
    return state;
  }

  /** Senkron ve otomasyonları beklemeden bir kez çalıştırır (arka planda). */
  @Post("automations/run-now")
  runNow() {
    if (!this.c.env.RUN_WORKERS) throw new ConflictException("Bu süreçte arka plan işleri kapalı (RUN_WORKERS=false).");
    void this.jobs.runSync();
    return { started: true };
  }

  @Get("inbox")
  inbox(@Query("filter") filter?: string) {
    return this.c.automationQueries.listConversations(filter === "needs_human");
  }

  @Get("inbox/:phone")
  async conversation(@Param("phone") raw: string) {
    const phone = normalizeTrMobile(raw) ?? raw.replace(/\D/g, "");
    const conversation = await this.c.automationQueries.getConversation(phone);
    if (!conversation) throw new NotFoundException("Konuşma bulunamadı");
    const windowOpen = !!conversation.lastInboundAt && Date.now() - conversation.lastInboundAt.getTime() < 24 * 3_600_000;
    return {
      phone,
      needsHuman: conversation.needsHuman,
      memberId: conversation.memberTicimaxId,
      profileName: conversation.profileName,
      windowOpen,
      windowClosesAt: conversation.lastInboundAt ? new Date(conversation.lastInboundAt.getTime() + 24 * 3_600_000).toISOString() : null,
      messages: await this.c.automationQueries.chatHistory(phone),
    };
  }

  /** Temsilci yanıtı. Meta kuralı: müşterinin son mesajından itibaren 24 saat içinde serbest metin gönderilebilir. */
  @Post("inbox/:phone/reply")
  async reply(@Param("phone") phone: string, @Body() body: unknown) {
    const input = replySchema.safeParse(body);
    if (!input.success) throw new BadRequestException("Mesaj boş olamaz (en fazla 4096 karakter).");
    const conversation = await this.c.automationQueries.getConversation(phone);
    if (!conversation) throw new NotFoundException("Konuşma bulunamadı");
    if (!conversation.lastInboundAt || Date.now() - conversation.lastInboundAt.getTime() >= 24 * 3_600_000) {
      throw new ConflictException("Müşterinin son mesajının üzerinden 24 saat geçti. Meta kuralı gereği yalnızca onaylı şablonla mesaj gönderilebilir.");
    }
    const waMessageId = await this.c.graph.sendText(phone, input.data.text);
    await this.c.automationQueries.recordChat({ phone, direction: "out", author: "agent", text: input.data.text, waMessageId, at: new Date() });
    return { ok: true };
  }

  @Post("inbox/:phone/resolve")
  async resolve(@Param("phone") phone: string) {
    await this.c.automationQueries.setNeedsHuman(phone, false);
    return { ok: true };
  }
}

/** Kargo takip yönlendirmesi (herkese açık, imzalı link). */
@Controller("t")
export class TrackingController {
  constructor(@Inject(CONTAINER) private readonly c: Container) {}

  @Get(":ref")
  async redirect(@Param("ref") ref: string, @Res() res: Response) {
    const orderId = verifyTrackingRef(ref, this.c.trackingSecret);
    const order = orderId ? await this.c.automationQueries.getOrder(orderId) : null;
    const link = order?.trackingLink;
    if (link && /^https?:\/\//i.test(link)) return res.redirect(302, link);
    res
      .status(order ? 200 : 404)
      .type("html")
      .send(
        `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Kargo takibi</title>` +
          `<body style="font-family:system-ui;padding:24px;max-width:520px;margin:auto">` +
          (order
            ? `<h1 style="font-size:20px">Takip bilgisi henüz hazır değil</h1><p>Kargo firması takip linkini paylaştığında bu adres otomatik olarak takip sayfasına yönlenecek.</p>`
            : `<h1 style="font-size:20px">Link geçersiz</h1>`) +
          `</body>`,
      );
  }
}
