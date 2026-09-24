"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { SegmentInfo, TemplateItem, VariableDef } from "@/lib/types";
import { launchCampaignAction, segmentReachAction } from "../../../actions";
import { WhatsAppPreview } from "../../templates/whatsapp-preview";

/** Sistem tarafından her müşteri için doldurulan değişkenler. */
const AUTO = new Set(["ad", "segment_adi"]);
const VAR_RE = /\{\{\s*([a-z0-9_]+)\s*\}\}/g;
const extract = (t: string) => [...new Set([...t.matchAll(VAR_RE)].map((m) => m[1]!))];
const fill = (t: string, v: Record<string, string>) => t.replace(VAR_RE, (_, k: string) => v[k] || `{{${k}}}`);

export function CampaignForm({ segments, templates, variables, initialSegment }: {
  segments: SegmentInfo[];
  templates: TemplateItem[];
  variables: VariableDef[];
  initialSegment: string;
}) {
  const [segment, setSegment] = useState(initialSegment);
  const [templateName, setTemplateName] = useState(templates[0]?.name ?? "");
  const [name, setName] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [reach, setReach] = useState<{ withPhone: number; withMarketingConsent: number } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const template = templates.find((t) => t.name === templateName);
  const seg = segments.find((s) => s.key === segment);
  const needed = useMemo(() => {
    if (!template) return [];
    const keys = [...extract(template.headerText ?? ""), ...extract(template.body), ...template.buttons.flatMap((b) => (b.type === "URL" ? extract(b.url) : []))];
    return [...new Set(keys)].filter((k) => !AUTO.has(k));
  }, [template]);
  const missing = needed.filter((k) => !values[k]?.trim());

  useEffect(() => {
    setReach(null);
    setConfirming(false);
    segmentReachAction(segment).then((r) => r.ok && setReach(r.data));
  }, [segment]);

  const previewValues = { ad: "Ayşe", segment_adi: seg?.label ?? "", ...values };
  const preview = template
    ? {
        header: template.headerText ? fill(template.headerText, previewValues) : null,
        body: fill(template.body, previewValues),
        footer: template.footer,
        buttons: template.buttons.map((b) => (b.type === "URL" ? { type: b.type, text: b.text, url: fill(b.url, previewValues) } : b)),
      }
    : null;

  const launch = () =>
    start(async () => {
      const r = await launchCampaignAction({ name, segment, templateName, variables: Object.fromEntries(needed.map((k) => [k, values[k] ?? ""])) });
      setConfirming(false);
      setResult(r.ok
        ? { ok: true, text: `Kampanya başlatıldı: ${r.data.queued} müşteri için mesaj kuyruğa alındı.` }
        : { ok: false, text: r.error });
    });

  if (!templates.length) {
    return (
      <div className="card max-w-2xl space-y-3">
        <h1 className="text-xl font-semibold">Yeni kampanya</h1>
        <p className="text-sm text-slate-600">
          Kampanya için &quot;Segment kampanyası&quot; tetikleyicili ve Meta onaylı bir şablon gerekiyor. Henüz yok.
        </p>
        <Link href="/templates/new" className="btn-primary w-fit">Kampanya şablonu oluştur</Link>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="card space-y-5">
        <div>
          <Link href="/campaigns" className="text-sm text-slate-500 hover:text-slate-900">← Kampanyalar</Link>
          <h1 className="mt-1 text-xl font-semibold">Yeni kampanya</h1>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="segment">Hedef segment</label>
            <select id="segment" className="input" value={segment} onChange={(e) => setSegment(e.target.value)}>
              {segments.map((s) => (
                <option key={s.key} value={s.key}>{s.label} ({s.customers})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="template">Şablon</label>
            <select id="template" className="input font-mono" value={templateName} onChange={(e) => setTemplateName(e.target.value)}>
              {templates.map((t) => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="name">Kampanya adı</label>
            <input id="name" className="input" maxLength={120} value={name} placeholder={`${seg?.label ?? ""} kampanyası`} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>

        {seg && <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">{seg.description} <b>Öneri:</b> {seg.action}</p>}

        <div className="space-y-3">
          <p className="label">Kampanya değerleri</p>
          <p className="text-xs text-slate-500">Müşteri adı ve segment adı her müşteri için otomatik doldurulur.</p>
          {needed.length === 0 && <p className="text-sm text-slate-500">Bu şablonda doldurulacak başka değer yok.</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            {needed.map((k) => {
              const def = variables.find((v) => v.key === k);
              return (
                <div key={k}>
                  <label className="label" htmlFor={`v-${k}`}>{def?.label ?? k}</label>
                  <input id={`v-${k}`} className="input" maxLength={200} placeholder={def?.example} value={values[k] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))} />
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-md border border-slate-200 p-4 text-sm">
          <p className="font-medium">Tahmini erişim</p>
          {reach ? (
            <p className="text-slate-600">
              Segmentte telefonu olan <b>{reach.withPhone}</b> müşteri var. Pazarlama izni açık olan: <b>{reach.withMarketingConsent}</b> müşteri.
              İzni olmayanlar ve bu hafta sınır sayıda mesaj almış olanlar otomatik atlanır.
            </p>
          ) : (
            <p className="text-slate-500">Hesaplanıyor…</p>
          )}
        </div>

        {result && <p className={`text-sm ${result.ok ? "text-emerald-700" : "text-red-600"}`}>{result.text} {result.ok && <Link href="/campaigns" className="underline">Kampanyaları gör</Link>}</p>}

        {!result?.ok && (
          confirming ? (
            <div className="flex flex-wrap items-center gap-3 rounded-md bg-amber-50 p-3">
              <span className="text-sm text-amber-900">
                {reach?.withMarketingConsent ?? "?"} müşteriye WhatsApp mesajı gönderilecek. Bu işlem geri alınamaz.
              </span>
              <button className="btn-primary" disabled={pending} onClick={launch}>{pending ? "Başlatılıyor…" : "Evet, gönder"}</button>
              <button className="btn-secondary" disabled={pending} onClick={() => setConfirming(false)}>Vazgeç</button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
              <button className="btn-primary" disabled={missing.length > 0 || !reach?.withMarketingConsent} onClick={() => setConfirming(true)}>
                Kampanyayı gönder
              </button>
              {missing.length > 0 && <span className="text-sm text-red-600">Eksik değer: {missing.join(", ")}</span>}
              {reach && reach.withMarketingConsent === 0 && <span className="text-sm text-slate-500">Bu segmentte pazarlama izni olan müşteri yok.</span>}
            </div>
          )
        )}
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <p className="mb-2 text-sm font-medium text-slate-700">Önizleme (örnek müşteri: Ayşe)</p>
        <WhatsAppPreview preview={preview} />
      </div>
    </div>
  );
}
