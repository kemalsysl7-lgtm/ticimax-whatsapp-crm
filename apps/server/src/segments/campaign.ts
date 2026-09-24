import type { MessageQueue, MessageStore, TemplateStore } from "../messaging/ports";
import { enqueueMessage } from "../messaging/send";
import { extractVariables, type VariableValues } from "../templates/template";
import { SEGMENTS, type SegmentKey } from "./rfm";

/**
 * Bir segmente toplu kampanya. Her üye için ayrı bir mesaj kuyruğa alınır; izin, sessiz
 * saat ve haftalık sınır kuralları gönderim anında (processQueuedMessage) uygulanır.
 * `campaign:<id>:member:<üye>` anahtarı, aynı kampanyanın bir üyeye iki kez gitmesini engeller.
 */
export interface CampaignDeps {
  templates: TemplateStore;
  messages: MessageStore;
  queue: MessageQueue;
  audience(segment: SegmentKey): Promise<Array<{ memberTicimaxId: number; firstName: string; phone: string }>>;
  createCampaign(record: { name: string; segment: SegmentKey; templateId: number; variables: VariableValues; audienceSize: number }): Promise<number>;
  setQueuedCount(campaignId: number, queued: number): Promise<void>;
}

export class CampaignError extends Error {}

/** Kampanya şablonlarında sistemin kendisinin doldurduğu değişkenler. */
export const AUTO_VARIABLES = ["ad", "segment_adi"] as const;
const FALLBACK_NAME = "Değerli müşterimiz";

export async function launchCampaign(
  deps: CampaignDeps,
  input: { name: string; segment: SegmentKey; templateName: string; variables: VariableValues },
): Promise<{ campaignId: number; audienceSize: number; queued: number }> {
  const segment = SEGMENTS.find((s) => s.key === input.segment);
  if (!segment) throw new CampaignError("Bilinmeyen segment.");

  const template = await deps.templates.getByName(input.templateName);
  if (!template) throw new CampaignError("Şablon bulunamadı.");
  if (template.status !== "approved") throw new CampaignError("Kampanyada yalnızca Meta onaylı şablon kullanılabilir.");
  if (template.trigger !== "segment_campaign") {
    throw new CampaignError('Kampanyada yalnızca "Segment kampanyası" tetikleyicili şablonlar kullanılabilir.');
  }

  const required = new Set([
    ...extractVariables(template.headerText ?? ""),
    ...extractVariables(template.body),
    ...template.buttons.flatMap((b) => (b.type === "URL" ? extractVariables(b.url) : [])),
  ]);
  const staticValues: VariableValues = {};
  for (const [k, v] of Object.entries(input.variables)) if (v.trim()) staticValues[k] = v.trim();
  const missing = [...required].filter((k) => !(AUTO_VARIABLES as readonly string[]).includes(k) && !staticValues[k]);
  if (missing.length) throw new CampaignError(`Eksik değişken değerleri: ${missing.join(", ")}`);

  const audience = await deps.audience(input.segment);
  if (!audience.length) throw new CampaignError("Bu segmentte telefonu olan müşteri yok.");

  const campaignId = await deps.createCampaign({
    name: input.name.trim() || `${segment.label} kampanyası`,
    segment: input.segment,
    templateId: template.id,
    variables: staticValues,
    audienceSize: audience.length,
  });

  let queued = 0;
  for (const member of audience) {
    const result = await enqueueMessage(deps, {
      dedupeKey: `campaign:${campaignId}:member:${member.memberTicimaxId}`,
      phone: member.phone,
      memberTicimaxId: member.memberTicimaxId,
      templateName: template.name,
      variables: { ...staticValues, ad: member.firstName.trim() || FALLBACK_NAME, segment_adi: segment.label },
      campaignId,
    });
    if (result.created) queued++;
  }
  await deps.setQueuedCount(campaignId, queued);
  return { campaignId, audienceSize: audience.length, queued };
}
