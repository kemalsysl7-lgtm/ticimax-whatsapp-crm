import { beforeEach, describe, expect, it } from "vitest";
import { FakeMessageStore, FakeQueue, FakeTemplateStore } from "../messaging/fakes";
import type { StoredTemplate } from "../messaging/ports";
import { OPT_OUT_BUTTON_TEXT } from "../templates/template";
import { CampaignError, launchCampaign, type CampaignDeps } from "./campaign";

const campaignTemplate: StoredTemplate = {
  id: 10,
  name: "geri_kazanma_v1",
  language: "tr",
  category: "MARKETING",
  trigger: "segment_campaign",
  status: "approved",
  body: "Merhaba {{ad}}, seni özledik! {{kupon_kodu}} koduyla %20 indirim.",
  footer: "Mesaj almak istemiyorsanız DUR yazın",
  buttons: [{ type: "QUICK_REPLY", text: OPT_OUT_BUTTON_TEXT }],
};

let deps: CampaignDeps & { messages: FakeMessageStore; queue: FakeQueue; templates: FakeTemplateStore; created: unknown[]; queuedCounts: Map<number, number> };

beforeEach(() => {
  const created: unknown[] = [];
  const queuedCounts = new Map<number, number>();
  deps = {
    templates: new FakeTemplateStore([campaignTemplate, { ...campaignTemplate, id: 11, name: "kargo_v1", trigger: "order_status", category: "UTILITY" }]),
    messages: new FakeMessageStore(),
    queue: new FakeQueue(),
    created,
    queuedCounts,
    audience: async () => [
      { memberTicimaxId: 1, firstName: "Ayşe", phone: "905321111111" },
      { memberTicimaxId: 2, firstName: " ", phone: "905322222222" },
    ],
    createCampaign: async (r) => {
      created.push(r);
      return created.length;
    },
    setQueuedCount: async (id, n) => {
      queuedCounts.set(id, n);
    },
  };
});

describe("launchCampaign", () => {
  it("segmentteki her üyeye kişisel değişkenlerle mesaj kuyruğa alır", async () => {
    const result = await launchCampaign(deps, { name: "Uyuyanlar Eylül", segment: "sleeping", templateName: "geri_kazanma_v1", variables: { kupon_kodu: " OZLEDIK20 " } });
    expect(result).toEqual({ campaignId: 1, audienceSize: 2, queued: 2 });
    const rows = [...deps.messages.rows.values()];
    expect(rows.map((r) => [r.dedupeKey, r.campaignId, r.variables])).toEqual([
      ["campaign:1:member:1", 1, { kupon_kodu: "OZLEDIK20", ad: "Ayşe", segment_adi: "Uyuyan" }],
      ["campaign:1:member:2", 1, { kupon_kodu: "OZLEDIK20", ad: "Değerli müşterimiz", segment_adi: "Uyuyan" }],
    ]);
    expect(deps.queue.jobs).toHaveLength(2);
    expect(deps.queuedCounts.get(1)).toBe(2);
  });

  it("eksik sabit değişkende kampanya oluşturmaz", async () => {
    await expect(launchCampaign(deps, { name: "", segment: "sleeping", templateName: "geri_kazanma_v1", variables: {} })).rejects.toThrow("kupon_kodu");
    expect(deps.created).toHaveLength(0);
  });

  it("onaysız veya kampanya tetikleyicisi olmayan şablonu reddeder", async () => {
    deps.templates.templates[0] = { ...campaignTemplate, status: "pending" };
    await expect(launchCampaign(deps, { name: "", segment: "lost", templateName: "geri_kazanma_v1", variables: { kupon_kodu: "X" } })).rejects.toBeInstanceOf(CampaignError);
    await expect(launchCampaign(deps, { name: "", segment: "lost", templateName: "kargo_v1", variables: {} })).rejects.toThrow("Segment kampanyası");
  });

  it("boş segmentte kampanya oluşturmaz", async () => {
    deps.audience = async () => [];
    await expect(launchCampaign(deps, { name: "", segment: "champions", templateName: "geri_kazanma_v1", variables: { kupon_kodu: "X" } })).rejects.toThrow("telefonu olan müşteri yok");
  });
});
