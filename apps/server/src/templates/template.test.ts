import { describe, expect, it } from "vitest";
import {
  MissingVariableError,
  OPT_OUT_BUTTON_TEXT,
  buildSendComponents,
  extractVariables,
  renderPreview,
  toMetaCreatePayload,
  validateTemplate,
  type TemplateDefinition,
} from "./template";

const priceDrop: TemplateDefinition = {
  name: "fiyat_dustu_v1",
  language: "tr",
  category: "MARKETING",
  trigger: "price_drop",
  headerText: "Fiyat düştü, {{ad}}!",
  body: "Takip ettiğin {{urun_adi}} şimdi {{eski_fiyat}} yerine {{yeni_fiyat}}. Kaçırma.",
  footer: "Mesaj almak istemiyorsanız DUR yazın",
  buttons: [
    { type: "URL", text: "Ürüne git", url: "https://magaza.com/{{urun_yolu}}" },
    { type: "QUICK_REPLY", text: OPT_OUT_BUTTON_TEXT },
  ],
};

describe("extractVariables", () => {
  it("değişkenleri sırayla ve tekrarsız döner", () => {
    expect(extractVariables("{{ad}} {{urun_adi}} {{ad}} {{ yeni_fiyat }}")).toEqual(["ad", "urun_adi", "yeni_fiyat"]);
  });
});

describe("validateTemplate", () => {
  it("geçerli bir şablon için sorun döndürmez", () => {
    expect(validateTemplate(priceDrop)).toEqual([]);
  });

  it("tetikleyicide olmayan değişkeni yakalar", () => {
    const issues = validateTemplate({ ...priceDrop, body: "Merhaba {{ad}}, siparişin {{siparis_no}} hazır." });
    expect(issues).toContainEqual({
      field: "body",
      message: '"siparis_no" bu tetikleyicide kullanılabilecek bir değişken değil.',
    });
  });

  it("hatalı süslü parantez yazımını yakalar", () => {
    const issues = validateTemplate({ ...priceDrop, body: "Merhaba {{Ad}}, {{urun_adi} indirimde." });
    expect(issues.some((i) => i.field === "body" && i.message.startsWith("Hatalı değişken"))).toBe(true);
  });

  it("gövdenin değişkenle başlayıp bitmesini reddeder", () => {
    const issues = validateTemplate({ ...priceDrop, body: "{{ad}} indirim var {{yeni_fiyat}}" });
    expect(issues.some((i) => i.message.includes("başlayamaz veya bitemez"))).toBe(true);
  });

  it("URL butonunda değişken sonda değilse reddeder", () => {
    const issues = validateTemplate({
      ...priceDrop,
      buttons: [
        { type: "URL", text: "Git", url: "https://magaza.com/{{urun_yolu}}/detay" },
        { type: "QUICK_REPLY", text: OPT_OUT_BUTTON_TEXT },
      ],
    });
    expect(issues.some((i) => i.message.includes("en sonunda"))).toBe(true);
  });

  it("pazarlama şablonunda çıkış yolu yoksa reddeder", () => {
    const issues = validateTemplate({ ...priceDrop, footer: null, buttons: [] });
    expect(issues.some((i) => i.field === "footer" && i.message.includes("çıkış yolu"))).toBe(true);
  });

  it("utility şablonunda çıkış yolu zorunlu değildir", () => {
    const issues = validateTemplate({
      name: "kargoya_verildi_v1",
      language: "tr",
      category: "UTILITY",
      trigger: "order_status",
      body: "Merhaba {{ad}}, {{siparis_no}} numaralı siparişin {{kargo_firmasi}} ile yola çıktı.",
      buttons: [],
    });
    expect(issues).toEqual([]);
  });

  it("büyük harfli şablon adını reddeder", () => {
    expect(validateTemplate({ ...priceDrop, name: "Fiyat Dustu" }).some((i) => i.field === "name")).toBe(true);
  });
});

describe("renderPreview", () => {
  it("değerleri doldurur, eksikleri görünür bırakır", () => {
    const preview = renderPreview(priceDrop, { ad: "Ayşe", urun_adi: "Keten Gömlek", urun_yolu: "keten-gomlek" });
    expect(preview.header).toBe("Fiyat düştü, Ayşe!");
    expect(preview.body).toContain("Keten Gömlek şimdi {{eski_fiyat}}");
    expect(preview.buttons[0]).toEqual({ type: "URL", text: "Ürüne git", url: "https://magaza.com/keten-gomlek" });
  });
});

describe("toMetaCreatePayload", () => {
  it("isimli parametre örnekleriyle Meta gövdesini üretir", () => {
    const payload = toMetaCreatePayload(priceDrop) as { components: Array<Record<string, unknown>> };
    const body = payload.components.find((c) => c.type === "BODY")!;
    expect(body.example).toEqual({
      body_text_named_params: [
        { param_name: "urun_adi", example: "Keten Gömlek" },
        { param_name: "eski_fiyat", example: "899,90 TL" },
        { param_name: "yeni_fiyat", example: "649,90 TL" },
      ],
    });
    const buttons = payload.components.find((c) => c.type === "BUTTONS")!.buttons as Array<Record<string, unknown>>;
    expect(buttons[0]).toEqual({
      type: "URL",
      text: "Ürüne git",
      url: "https://magaza.com/{{1}}",
      example: ["https://magaza.com/keten-gomlek"],
    });
    expect(buttons[1]).toEqual({ type: "QUICK_REPLY", text: OPT_OUT_BUTTON_TEXT });
  });
});

describe("buildSendComponents", () => {
  const values = {
    ad: "Ayşe",
    urun_adi: "Keten\nGömlek",
    eski_fiyat: "899,90 TL",
    yeni_fiyat: "649,90 TL",
    urun_yolu: "keten-gomlek",
  };

  it("header, body ve URL butonu parametrelerini üretir", () => {
    const components = buildSendComponents(priceDrop, values);
    expect(components).toEqual([
      { type: "header", parameters: [{ type: "text", parameter_name: "ad", text: "Ayşe" }] },
      {
        type: "body",
        parameters: [
          { type: "text", parameter_name: "urun_adi", text: "Keten Gömlek" },
          { type: "text", parameter_name: "eski_fiyat", text: "899,90 TL" },
          { type: "text", parameter_name: "yeni_fiyat", text: "649,90 TL" },
        ],
      },
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "keten-gomlek" }] },
    ]);
  });

  it("eksik veya boş değişkende hata fırlatır", () => {
    expect(() => buildSendComponents(priceDrop, { ...values, yeni_fiyat: "  " })).toThrow(MissingVariableError);
  });
});
