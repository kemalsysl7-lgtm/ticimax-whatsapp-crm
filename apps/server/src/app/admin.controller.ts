import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { normalizeTrMobile } from "../common/phone";
import { enqueueMessage } from "../messaging/send";
import { renderPreview, validateTemplate, type TemplateDefinition } from "../templates/template";
import { TemplateStateError, TemplateValidationError } from "../templates/template-service";
import { TRIGGERS, type TriggerType } from "../templates/triggers";
import { AdminGuard } from "./admin.guard";
import { CONTAINER, type Container } from "./container";

const buttonSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("URL"), text: z.string(), url: z.string() }),
  z.object({ type: z.literal("QUICK_REPLY"), text: z.string() }),
]);

const templateSchema = z.object({
  name: z.string(),
  language: z.string().default("tr"),
  category: z.enum(["UTILITY", "MARKETING"]),
  trigger: z.enum(Object.keys(TRIGGERS) as [TriggerType, ...TriggerType[]]),
  headerText: z.string().nullish(),
  body: z.string(),
  footer: z.string().nullish(),
  buttons: z.array(buttonSchema).default([]),
});

const previewSchema = z.object({ template: templateSchema, values: z.record(z.string(), z.string()).default({}) });

const testMessageSchema = z.object({
  phone: z.string(),
  templateName: z.string(),
  variables: z.record(z.string(), z.string()),
});

const consentSchema = z.object({
  phone: z.string(),
  purpose: z.enum(["transactional", "marketing"]),
  granted: z.boolean(),
  note: z.string().max(500).optional(),
});

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException({ issues: result.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) });
  }
  return result.data;
}

function mapServiceError(err: unknown): never {
  if (err instanceof TemplateValidationError) throw new BadRequestException({ issues: err.issues });
  if (err instanceof TemplateStateError) throw new ConflictException(err.message);
  throw err;
}

/** Yönetim API'si (panel bu uç noktaları kullanır). */
@Controller("admin")
@UseGuards(AdminGuard)
export class AdminController {
  constructor(@Inject(CONTAINER) private readonly c: Container) {}

  /** Tetikleyiciler ve kullanılabilir değişkenler (şablon editörü için). */
  @Get("triggers")
  triggers() {
    return TRIGGERS;
  }

  @Get("templates")
  listTemplates() {
    return this.c.stores.templates.list();
  }

  /** Kaydetmeden doğrulama + WhatsApp balonu önizlemesi. */
  @Post("templates/preview")
  preview(@Body() body: unknown) {
    const { template, values } = parse(previewSchema, body);
    const examples = Object.fromEntries(TRIGGERS[template.trigger].variables.map((v) => [v.key, v.example]));
    return {
      issues: validateTemplate(template as TemplateDefinition),
      preview: renderPreview(template as TemplateDefinition, { ...examples, ...values }),
    };
  }

  @Post("templates")
  async createTemplate(@Body() body: unknown) {
    return this.c.templateService.create(parse(templateSchema, body) as TemplateDefinition).catch(mapServiceError);
  }

  @Put("templates/:id")
  async updateTemplate(@Param("id", ParseIntPipe) id: number, @Body() body: unknown) {
    return this.c.templateService.update(id, parse(templateSchema, body) as TemplateDefinition).catch(mapServiceError);
  }

  /** Şablonu Meta onayına gönderir. */
  @Post("templates/:id/submit")
  async submitTemplate(@Param("id", ParseIntPipe) id: number) {
    const status = await this.c.templateService.submit(id).catch(mapServiceError);
    return { status };
  }

  /** Onaylı bir şablonla tek bir numaraya test mesajı (izin ve politika kuralları yine uygulanır). */
  @Post("messages/test")
  async testMessage(@Body() body: unknown) {
    const input = parse(testMessageSchema, body);
    const phone = normalizeTrMobile(input.phone);
    if (!phone) throw new BadRequestException("Geçersiz Türkiye cep telefonu numarası");
    const result = await enqueueMessage(this.c.sendDeps, {
      dedupeKey: `test:${randomUUID()}`,
      phone,
      memberTicimaxId: await this.c.stores.mirror.findMemberIdByPhone(phone),
      templateName: input.templateName,
      variables: input.variables,
    });
    if (!result.created) throw new NotFoundException(`Mesaj oluşturulamadı: ${result.reason}`);
    return result;
  }

  @Get("messages")
  listMessages() {
    return this.c.stores.messages.listRecent(100);
  }

  /** Elle izin kaydı (ör. mağazada yazılı onay alınan müşteri). */
  @Post("consents")
  async addConsent(@Body() body: unknown) {
    const input = parse(consentSchema, body);
    const phone = normalizeTrMobile(input.phone);
    if (!phone) throw new BadRequestException("Geçersiz Türkiye cep telefonu numarası");
    await this.c.stores.consents.append({
      phone,
      memberTicimaxId: await this.c.stores.mirror.findMemberIdByPhone(phone),
      purpose: input.purpose,
      granted: input.granted,
      source: "manual",
      createdAt: this.c.clock.now(),
      evidence: input.note ? { note: input.note } : null,
    });
    return { ok: true };
  }
}
