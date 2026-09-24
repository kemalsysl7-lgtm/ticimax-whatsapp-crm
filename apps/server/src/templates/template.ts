import { TRIGGERS, type TemplateCategory, type TriggerType } from "./triggers";

/**
 * Şablon tanımı. Değişkenler `{{degisken_adi}}` biçiminde yazılır (Meta "named parameter" formatı).
 * Bu modül framework'ten bağımsızdır: doğrulama, önizleme ve Meta API gövdelerini üretir.
 */
export type TemplateButton =
  | { type: "URL"; text: string; url: string }
  | { type: "QUICK_REPLY"; text: string };

export interface TemplateDefinition {
  name: string;
  language: string;
  category: TemplateCategory;
  trigger: TriggerType;
  headerText?: string | null;
  body: string;
  footer?: string | null;
  buttons: TemplateButton[];
}

export interface ValidationIssue {
  field: string;
  message: string;
}

export type VariableValues = Record<string, string>;

/** Meta'nın isimli parametre biçimi. İlk gerçek şablon gönderiminde Meta dokümanıyla teyit edilmeli. */
export const META_PARAMETER_FORMAT = "named";

/** Müşterinin "DUR" yazarak ya da bu butona basarak marketing mesajlarından çıkabilmesi için. */
export const OPT_OUT_BUTTON_TEXT = "Bildirimleri kapat";

const VARIABLE_RE = /\{\{\s*([a-z0-9_]+)\s*\}\}/g;
const ANY_BRACES_RE = /\{\{|\}\}/g;

const LIMITS = {
  name: 512,
  headerText: 60,
  body: 1024,
  footer: 60,
  buttonText: 25,
  buttons: 10,
  urlButtons: 2,
} as const;

/** Metindeki değişken adlarını, ilk görülme sırasıyla ve tekrarsız döner. */
export function extractVariables(text: string): string[] {
  const seen = new Set<string>();
  for (const match of text.matchAll(VARIABLE_RE)) seen.add(match[1]!);
  return [...seen];
}

function hasMalformedBraces(text: string): boolean {
  const wellFormed = [...text.matchAll(VARIABLE_RE)].length * 2;
  const allBraces = [...text.matchAll(ANY_BRACES_RE)].length;
  return allBraces !== wellFormed;
}

export function validateTemplate(def: TemplateDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const allowed = new Set(TRIGGERS[def.trigger]?.variables.map((v) => v.key) ?? []);
  const push = (field: string, message: string) => issues.push({ field, message });

  if (!TRIGGERS[def.trigger]) push("trigger", "Bilinmeyen tetikleyici.");

  if (!/^[a-z0-9_]+$/.test(def.name) || def.name.length > LIMITS.name) {
    push("name", "Şablon adı yalnızca küçük harf, rakam ve alt çizgi içerebilir.");
  }

  const checkVariables = (field: string, text: string) => {
    if (hasMalformedBraces(text)) {
      push(field, "Hatalı değişken yazımı. Değişkenler {{degisken_adi}} biçiminde olmalı.");
    }
    for (const v of extractVariables(text)) {
      if (!allowed.has(v)) push(field, `"${v}" bu tetikleyicide kullanılabilecek bir değişken değil.`);
    }
  };

  // Başlık
  if (def.headerText) {
    if (def.headerText.length > LIMITS.headerText) {
      push("headerText", `Başlık en fazla ${LIMITS.headerText} karakter olabilir.`);
    }
    if (extractVariables(def.headerText).length > 1) push("headerText", "Başlıkta en fazla 1 değişken olabilir.");
    checkVariables("headerText", def.headerText);
  }

  // Gövde
  const body = def.body.trim();
  if (!body) push("body", "Mesaj gövdesi boş olamaz.");
  if (def.body.length > LIMITS.body) push("body", `Mesaj gövdesi en fazla ${LIMITS.body} karakter olabilir.`);
  if (/^\{\{/.test(body) || /\}\}$/.test(body)) {
    push("body", "Mesaj gövdesi bir değişkenle başlayamaz veya bitemez (Meta kuralı).");
  }
  checkVariables("body", def.body);

  // Alt bilgi
  if (def.footer) {
    if (def.footer.length > LIMITS.footer) push("footer", `Alt bilgi en fazla ${LIMITS.footer} karakter olabilir.`);
    if (/\{\{|\}\}/.test(def.footer)) push("footer", "Alt bilgide değişken kullanılamaz.");
  }

  // Butonlar
  if (def.buttons.length > LIMITS.buttons) push("buttons", `En fazla ${LIMITS.buttons} buton eklenebilir.`);
  if (def.buttons.filter((b) => b.type === "URL").length > LIMITS.urlButtons) {
    push("buttons", `En fazla ${LIMITS.urlButtons} URL butonu eklenebilir.`);
  }
  def.buttons.forEach((b, i) => {
    const field = `buttons[${i}]`;
    if (!b.text.trim() || b.text.length > LIMITS.buttonText) {
      push(field, `Buton metni 1-${LIMITS.buttonText} karakter olmalı.`);
    }
    if (b.type === "URL") {
      if (!/^https:\/\//.test(b.url)) push(field, "Buton adresi https:// ile başlamalı.");
      const vars = extractVariables(b.url);
      if (vars.length > 1) push(field, "Buton adresinde en fazla 1 değişken olabilir.");
      if (vars.length === 1 && !/\{\{\s*[a-z0-9_]+\s*\}\}$/.test(b.url)) {
        push(field, "Buton adresindeki değişken adresin en sonunda olmalı.");
      }
      checkVariables(field, b.url);
    }
  });

  // Marketing mesajlarında ret yolu zorunlu (İYS + Meta kalite puanı).
  if (def.category === "MARKETING") {
    const hasOptOutButton = def.buttons.some((b) => b.type === "QUICK_REPLY" && b.text === OPT_OUT_BUTTON_TEXT);
    const footerMentionsStop = /\bDUR\b/.test(def.footer ?? "");
    if (!hasOptOutButton && !footerMentionsStop) {
      push(
        "footer",
        `Pazarlama şablonlarında çıkış yolu olmalı: alt bilgiye "DUR" ifadesi ya da "${OPT_OUT_BUTTON_TEXT}" butonu ekleyin.`,
      );
    }
  }

  return issues;
}

/** Meta, parametre metinlerinde satır sonu, tab ve 4'ten fazla ardışık boşluğu reddeder. */
export function sanitizeParam(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
}

function fill(text: string, values: VariableValues): string {
  return text.replace(VARIABLE_RE, (_, key: string) => values[key] ?? `{{${key}}}`);
}

export interface TemplatePreview {
  header: string | null;
  body: string;
  footer: string | null;
  buttons: Array<{ type: TemplateButton["type"]; text: string; url?: string }>;
}

/** Panelde WhatsApp balonu önizlemesi için. Eksik değişkenler {{ad}} olarak görünür bırakılır. */
export function renderPreview(def: TemplateDefinition, values: VariableValues): TemplatePreview {
  return {
    header: def.headerText ? fill(def.headerText, values) : null,
    body: fill(def.body, values),
    footer: def.footer ?? null,
    buttons: def.buttons.map((b) => (b.type === "URL" ? { type: b.type, text: b.text, url: fill(b.url, values) } : b)),
  };
}

function exampleValues(def: TemplateDefinition): VariableValues {
  return Object.fromEntries(TRIGGERS[def.trigger].variables.map((v) => [v.key, v.example]));
}

/** Meta'ya "şablon oluştur" (POST /{WABA_ID}/message_templates) isteğinin gövdesi. */
export function toMetaCreatePayload(def: TemplateDefinition): Record<string, unknown> {
  const examples = exampleValues(def);
  const namedExamples = (text: string) =>
    extractVariables(text).map((key) => ({ param_name: key, example: examples[key] ?? key }));

  const components: Array<Record<string, unknown>> = [];

  if (def.headerText) {
    const params = namedExamples(def.headerText);
    components.push({
      type: "HEADER",
      format: "TEXT",
      text: def.headerText,
      ...(params.length ? { example: { header_text_named_params: params } } : {}),
    });
  }

  const bodyParams = namedExamples(def.body);
  components.push({
    type: "BODY",
    text: def.body,
    ...(bodyParams.length ? { example: { body_text_named_params: bodyParams } } : {}),
  });

  if (def.footer) components.push({ type: "FOOTER", text: def.footer });

  if (def.buttons.length) {
    components.push({
      type: "BUTTONS",
      buttons: def.buttons.map((b) => {
        if (b.type === "QUICK_REPLY") return { type: "QUICK_REPLY", text: b.text };
        const [variable] = extractVariables(b.url);
        if (!variable) return { type: "URL", text: b.text, url: b.url };
        // URL butonlarında Meta konumsal {{1}} bekler.
        return {
          type: "URL",
          text: b.text,
          url: b.url.replace(VARIABLE_RE, "{{1}}"),
          example: [fill(b.url, examples)],
        };
      }),
    });
  }

  return {
    name: def.name,
    language: def.language,
    category: def.category,
    parameter_format: META_PARAMETER_FORMAT,
    components,
  };
}

export class MissingVariableError extends Error {
  constructor(readonly missing: string[]) {
    super(`Eksik şablon değişkenleri: ${missing.join(", ")}`);
  }
}

/** Mesaj gönderiminde (POST /{PHONE_NUMBER_ID}/messages) kullanılan `template.components` dizisi. */
export function buildSendComponents(def: TemplateDefinition, values: VariableValues): Array<Record<string, unknown>> {
  const required = new Set<string>([
    ...extractVariables(def.headerText ?? ""),
    ...extractVariables(def.body),
    ...def.buttons.flatMap((b) => (b.type === "URL" ? extractVariables(b.url) : [])),
  ]);
  const clean: VariableValues = {};
  const missing: string[] = [];
  for (const key of required) {
    const value = sanitizeParam(values[key] ?? "");
    if (!value) missing.push(key);
    else clean[key] = value;
  }
  if (missing.length) throw new MissingVariableError(missing);

  const named = (text: string) =>
    extractVariables(text).map((key) => ({ type: "text", parameter_name: key, text: clean[key]! }));

  const components: Array<Record<string, unknown>> = [];
  if (def.headerText && extractVariables(def.headerText).length) {
    components.push({ type: "header", parameters: named(def.headerText) });
  }
  const bodyParams = named(def.body);
  if (bodyParams.length) components.push({ type: "body", parameters: bodyParams });

  def.buttons.forEach((b, index) => {
    if (b.type !== "URL") return;
    const [variable] = extractVariables(b.url);
    if (!variable) return;
    components.push({
      type: "button",
      sub_type: "url",
      index: String(index),
      parameters: [{ type: "text", text: clean[variable]! }],
    });
  });

  return components;
}
