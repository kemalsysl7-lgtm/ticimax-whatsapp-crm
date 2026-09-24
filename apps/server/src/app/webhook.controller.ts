import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Logger,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import { handleChatbot } from "../chatbot/handler";
import { REPLY_OPTED_IN, REPLY_OPTED_OUT, handleInboundMessage } from "../messaging/inbound";
import { verifyMetaSignature } from "../whatsapp/signature";
import { parseWebhook } from "../whatsapp/webhook-parser";
import { CONTAINER, type Container } from "./container";

/**
 * Meta WhatsApp webhook'u. İmzası doğrulanmayan istek işlenmez. İşleyiciler idempotent
 * olduğundan, bir hata durumunda 500 dönülür ve Meta'nın yeniden göndermesine izin verilir.
 */
@Controller("webhooks/whatsapp")
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(@Inject(CONTAINER) private readonly c: Container) {}

  /** Meta'nın webhook doğrulama isteği (uygulama panelinde webhook eklenirken). */
  @Get()
  verify(
    @Query("hub.mode") mode: string,
    @Query("hub.verify_token") token: string,
    @Query("hub.challenge") challenge: string,
  ): string {
    if (mode !== "subscribe" || token !== this.c.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) throw new ForbiddenException();
    return challenge;
  }

  @Post()
  @HttpCode(200)
  async receive(@Req() req: RawBodyRequest<Request>): Promise<{ ok: true }> {
    const signature = req.headers["x-hub-signature-256"];
    if (!req.rawBody || !verifyMetaSignature(req.rawBody, typeof signature === "string" ? signature : undefined, this.c.env.WHATSAPP_APP_SECRET)) {
      this.logger.warn("İmzası geçersiz webhook reddedildi");
      throw new UnauthorizedException();
    }

    for (const event of parseWebhook(req.body)) {
      switch (event.kind) {
        case "inbound_message": {
          const outcome = await handleInboundMessage(this.c.inboundDeps, {
            waMessageId: event.waMessageId,
            phone: event.from,
            profileName: event.profileName,
            type: event.type,
            text: event.text,
            buttonText: event.buttonText,
            receivedAt: event.timestamp,
          });
          if (outcome === "duplicate") break;
          const text = event.text ?? event.buttonText ?? `[${event.type}]`;
          const member = await this.c.automationQueries.memberByPhone(event.from);
          await this.c.automationQueries.recordChat({
            phone: event.from,
            direction: "in",
            author: "customer",
            text,
            waMessageId: event.waMessageId,
            at: event.timestamp,
            memberTicimaxId: member?.id ?? null,
            profileName: event.profileName,
          });
          if (outcome === "stored") {
            const bot = await handleChatbot(this.c.chatbotDeps, event.from, text);
            if (bot === "reply_failed") this.logger.warn("Asistan yanıtı gönderilemedi");
          } else {
            this.logger.log(`İzin değişikliği: ${outcome}`);
            if (!outcome.endsWith("_reply_failed")) {
              await this.c.automationQueries.recordChat({
                phone: event.from,
                direction: "out",
                author: "bot",
                text: outcome === "opted_in" ? REPLY_OPTED_IN : REPLY_OPTED_OUT,
                at: this.c.clock.now(),
              });
            }
          }
          break;
        }
        case "status":
          await this.c.stores.messages.applyDeliveryStatus(event.waMessageId, event.status, {
            errorCode: event.errorCode,
            errorTitle: event.errorTitle,
            pricingCategory: event.pricingCategory,
          });
          break;
        case "template_status":
          await this.c.templateService.applyMetaStatus(event.metaTemplateId, event.event, event.reason);
          this.logger.log(`Şablon durumu: ${event.templateName} → ${event.event}`);
          break;
      }
    }
    return { ok: true };
  }
}
