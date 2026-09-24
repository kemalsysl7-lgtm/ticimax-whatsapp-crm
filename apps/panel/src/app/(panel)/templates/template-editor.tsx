"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  STATUS_LABELS,
  type TemplateButton,
  type TemplateInput,
  type TemplateItem,
  type TemplatePreview,
  type TriggerCatalog,
  type ValidationIssue,
} from "@/lib/types";
import { previewAction, saveTemplateAction, submitTemplateAction } from "../../actions";
import { WhatsAppPreview } from "./whatsapp-preview";

/** Sunucudaki OPT_OUT_BUTTON_TEXT ile aynı olmalı: gelen buton yanıtı bu metinle eşleşir. */
const OPT_OUT_BUTTON_TEXT = "Bildirimleri kapat";

const EMPTY: TemplateInput = {
  name: "",
  language: "tr",
  category: "UTILITY",
  trigger: "order_status",
  headerText: null,
  body: "",
  footer: null,
  buttons: [],
};

type BodyField = "headerText" | "body";

export function TemplateEditor({ triggers, initial }: { triggers: TriggerCatalog; initial: TemplateItem | null }) {
  const router = useRouter();
  const [form, setForm] = useState<TemplateInput>(initial ?? EMPTY);
  const [preview, setPreview] = useState<TemplatePreview | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [saving, startSaving] = useTransition();
  const [dirty, setDirty] = useState(false);
  const [focused, setFocused] = useState<BodyField>("body");
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const headerRef = useRef<HTMLInputElement>(null);

  const editable = !initial || initial.status === "draft" || initial.status === "rejected";
  const variables = triggers[form.trigger]?.variables ?? [];

  const update = (patch: Partial<TemplateInput>) => {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
    setMessage(null);
  };

  // Canlı önizleme + doğrulama (sunucudaki kurallarla birebir aynı), 400 ms gecikmeyle.
  useEffect(() => {
    const handle = setTimeout(async () => {
      const result = await previewAction(form);
      if (result.ok) {
        setPreview(result.data.preview);
        setIssues(result.data.issues);
      } else {
        setIssues(result.issues);
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [form]);

  const insertVariable = (key: string) => {
    const token = `{{${key}}}`;
    const el = focused === "headerText" ? headerRef.current : bodyRef.current;
    const current = (focused === "headerText" ? form.headerText : form.body) ?? "";
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const next = current.slice(0, start) + token + current.slice(end);
    update(focused === "headerText" ? { headerText: next } : { body: next });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const setButton = (index: number, button: TemplateButton) =>
    update({ buttons: form.buttons.map((b, i) => (i === index ? button : b)) });

  const save = () =>
    startSaving(async () => {
      const result = await saveTemplateAction(initial?.id ?? null, form);
      if (!result.ok) {
        setIssues(result.issues.length ? result.issues : issues);
        setMessage({ kind: "error", text: result.error });
        return;
      }
      setDirty(false);
      setMessage({ kind: "success", text: "Şablon kaydedildi." });
      if (!initial) router.push(`/templates/${result.data.id}`);
      else router.refresh();
    });

  const submit = () =>
    startSaving(async () => {
      if (!initial) return;
      const result = await submitTemplateAction(initial.id);
      if (!result.ok) {
        setMessage({ kind: "error", text: result.error });
        return;
      }
      setMessage({ kind: "success", text: `Meta onayına gönderildi (durum: ${result.data.status}). Sonuç genelde birkaç dakika içinde gelir.` });
      router.refresh();
    });

  const issuesFor = (prefix: string) => issues.filter((i) => i.field === prefix || i.field.startsWith(`${prefix}[`));
  const FieldIssues = ({ field }: { field: string }) =>
    issuesFor(field).map((i, n) => (
      <p key={n} className="mt-1 text-xs text-red-600">
        {i.message}
      </p>
    ));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="card space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">{initial ? initial.name : "Yeni şablon"}</h1>
          {initial && <span className="text-sm text-slate-500">{STATUS_LABELS[initial.status]}</span>}
        </div>

        {!editable && (
          <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
            Onaya gönderilmiş şablonlar düzenlenemez. Değişiklik için yeni bir sürüm oluşturun (ör. <code>{initial?.name.replace(/_v\d+$/, "")}_v2</code>).
          </p>
        )}
        {initial?.status === "rejected" && initial.rejectionReason && (
          <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">Meta ret nedeni: {initial.rejectionReason}</p>
        )}

        <fieldset disabled={!editable} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="name">Şablon adı</label>
              <input
                id="name"
                className="input font-mono"
                value={form.name}
                placeholder="kargoya_verildi_v1"
                onChange={(e) => update({ name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
              />
              <FieldIssues field="name" />
            </div>
            <div>
              <label className="label" htmlFor="trigger">Tetikleyici</label>
              <select
                id="trigger"
                className="input"
                value={form.trigger}
                onChange={(e) => update({ trigger: e.target.value, category: triggers[e.target.value]?.defaultCategory ?? form.category })}
              >
                {Object.entries(triggers).map(([key, t]) => (
                  <option key={key} value={key}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="category">Kategori</label>
              <select
                id="category"
                className="input"
                value={form.category}
                onChange={(e) => update({ category: e.target.value as TemplateInput["category"] })}
              >
                <option value="UTILITY">Bilgilendirme (sipariş, kargo)</option>
                <option value="MARKETING">Pazarlama (kampanya, hatırlatma)</option>
              </select>
              <p className="mt-1 text-xs text-slate-500">Yanlış kategori Meta tarafından reddedilme sebebidir.</p>
            </div>
          </div>

          <div>
            <p className="label">Değişkenler</p>
            <p className="mb-2 text-xs text-slate-500">Tıklayınca imlecin olduğu yere eklenir ({focused === "headerText" ? "başlık" : "mesaj"}).</p>
            <div className="flex flex-wrap gap-2">
              {variables.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  title={`Örnek: ${v.example}`}
                  onClick={() => insertVariable(v.key)}
                  className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-800 hover:bg-emerald-100"
                >
                  {v.label} <span className="font-mono text-emerald-600">{`{{${v.key}}}`}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label" htmlFor="headerText">Başlık (isteğe bağlı)</label>
            <input
              id="headerText"
              ref={headerRef}
              className="input"
              value={form.headerText ?? ""}
              maxLength={60}
              onFocus={() => setFocused("headerText")}
              onChange={(e) => update({ headerText: e.target.value || null })}
            />
            <FieldIssues field="headerText" />
          </div>

          <div>
            <label className="label" htmlFor="body">Mesaj</label>
            <textarea
              id="body"
              ref={bodyRef}
              className="input min-h-36"
              value={form.body}
              maxLength={1024}
              onFocus={() => setFocused("body")}
              onChange={(e) => update({ body: e.target.value })}
            />
            <div className="flex justify-between text-xs text-slate-500">
              <span>*kalın*, _italik_ WhatsApp biçimleri desteklenir.</span>
              <span>{form.body.length}/1024</span>
            </div>
            <FieldIssues field="body" />
          </div>

          <div>
            <label className="label" htmlFor="footer">Alt bilgi (isteğe bağlı)</label>
            <input
              id="footer"
              className="input"
              value={form.footer ?? ""}
              maxLength={60}
              placeholder={form.category === "MARKETING" ? "Mesaj almak istemiyorsanız DUR yazın" : ""}
              onChange={(e) => update({ footer: e.target.value || null })}
            />
            <FieldIssues field="footer" />
          </div>

          <div className="space-y-3">
            <p className="label">Butonlar</p>
            {form.buttons.map((b, i) => (
              <div key={i} className="rounded-md border border-slate-200 p-3">
                <div className="flex gap-2">
                  <input
                    className="input"
                    placeholder="Buton metni"
                    maxLength={25}
                    value={b.text}
                    onChange={(e) => setButton(i, { ...b, text: e.target.value })}
                  />
                  <button type="button" className="btn-secondary" onClick={() => update({ buttons: form.buttons.filter((_, n) => n !== i) })}>
                    Sil
                  </button>
                </div>
                {b.type === "URL" && (
                  <input
                    className="input mt-2 font-mono"
                    placeholder="https://magazaniz.com/{{urun_yolu}}"
                    value={b.url}
                    onChange={(e) => setButton(i, { ...b, url: e.target.value })}
                  />
                )}
                <p className="mt-1 text-xs text-slate-500">{b.type === "URL" ? "Link butonu (değişken yalnızca adresin sonunda olabilir)" : "Hızlı yanıt butonu"}</p>
                <FieldIssues field={`buttons[${i}]`} />
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={() => update({ buttons: [...form.buttons, { type: "URL", text: "", url: "https://" }] })}>
                + Link butonu
              </button>
              <button type="button" className="btn-secondary" onClick={() => update({ buttons: [...form.buttons, { type: "QUICK_REPLY", text: "" }] })}>
                + Hızlı yanıt
              </button>
              {form.category === "MARKETING" && !form.buttons.some((b) => b.text === OPT_OUT_BUTTON_TEXT) && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => update({ buttons: [...form.buttons, { type: "QUICK_REPLY", text: OPT_OUT_BUTTON_TEXT }] })}
                >
                  + &quot;{OPT_OUT_BUTTON_TEXT}&quot;
                </button>
              )}
            </div>
            <FieldIssues field="buttons" />
          </div>
        </fieldset>

        {message && <p className={`text-sm ${message.kind === "error" ? "text-red-600" : "text-emerald-700"}`}>{message.text}</p>}

        {editable && (
          <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-4">
            <button type="button" className="btn-primary" onClick={save} disabled={saving || issues.length > 0}>
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </button>
            {initial && (
              <button type="button" className="btn-secondary" onClick={submit} disabled={saving || dirty || issues.length > 0}>
                Meta onayına gönder
              </button>
            )}
            {issues.length > 0 && <span className="self-center text-sm text-red-600">{issues.length} sorun düzeltilmeli</span>}
            {initial && dirty && issues.length === 0 && <span className="self-center text-sm text-slate-500">Onaya göndermeden önce kaydedin.</span>}
          </div>
        )}
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <p className="mb-2 text-sm font-medium text-slate-700">Önizleme (örnek değerlerle)</p>
        <WhatsAppPreview preview={preview} />
      </div>
    </div>
  );
}
