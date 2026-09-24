"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { STATUS_LABELS, type AutomationItem } from "@/lib/types";
import { saveAutomationAction } from "../../actions";

type Settings = Record<string, unknown>;

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/** Her otomasyona özgü ayar alanları. */
function SettingsFields({ item, settings, set }: { item: AutomationItem; settings: Settings; set: (patch: Settings) => void }) {
  const id = (k: string) => `${item.key}-${k}`;
  const num = (k: string) => String(settings[k] ?? "");
  switch (item.key) {
    case "abandoned_cart": {
      const delays = (settings.delaysHours as number[]) ?? [2, 24, 72];
      const coupons = (settings.couponCodes as string[]) ?? ["", "", ""];
      return (
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-700">Hatırlatma kademeleri</p>
          {delays.map((h, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
              <Field id={id(`delay-${i}`)} label={`${i + 1}. hatırlatma (saat sonra)`}>
                <input id={id(`delay-${i}`)} type="number" min={1} max={336} className="input" value={h}
                  onChange={(e) => set({ delaysHours: delays.map((d, j) => (j === i ? Number(e.target.value) : d)) })} />
              </Field>
              <Field id={id(`coupon-${i}`)} label="Kupon kodu">
                <input id={id(`coupon-${i}`)} className="input" maxLength={40} value={coupons[i] ?? ""} placeholder="(kuponsuz)"
                  onChange={(e) => set({ couponCodes: delays.map((_, j) => (j === i ? e.target.value : coupons[j] ?? "")) })} />
              </Field>
              {delays.length > 1 && (
                <button type="button" className="btn-secondary" onClick={() => set({ delaysHours: delays.filter((_, j) => j !== i), couponCodes: coupons.filter((_, j) => j !== i) })}>
                  Sil
                </button>
              )}
            </div>
          ))}
          {delays.length < 3 && (
            <button type="button" className="btn-secondary" onClick={() => set({ delaysHours: [...delays, (delays.at(-1) ?? 24) * 2], couponCodes: [...coupons.slice(0, delays.length), ""] })}>
              + Kademe ekle
            </button>
          )}
          <Field id={id("cartPath")} label="Sepet sayfası yolu" hint="Şablondaki sepet butonunun sonuna eklenir (ör. sepet).">
            <input id={id("cartPath")} className="input" value={String(settings.cartPath ?? "")} onChange={(e) => set({ cartPath: e.target.value })} />
          </Field>
        </div>
      );
    }
    case "price_drop":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id={id("min")} label="En az indirim (%)" hint="Bunun altındaki düşüşler için mesaj gitmez.">
            <input id={id("min")} type="number" min={1} max={90} className="input" value={num("minDropPercent")} onChange={(e) => set({ minDropPercent: Number(e.target.value) })} />
          </Field>
          <Field id={id("every")} label="Kontrol sıklığı (saat)" hint="Her üye için Ticimax'e ayrı sorgu atılır.">
            <input id={id("every")} type="number" min={1} max={168} className="input" value={num("checkEveryHours")} onChange={(e) => set({ checkEveryHours: Number(e.target.value) })} />
          </Field>
        </div>
      );
    case "back_in_stock":
      return (
        <Field id={id("every")} label="Kontrol sıklığı (saat)">
          <input id={id("every")} type="number" min={1} max={168} className="input w-40" value={num("checkEveryHours")} onChange={(e) => set({ checkEveryHours: Number(e.target.value) })} />
        </Field>
      );
    case "birthday":
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id={id("coupon")} label="Kupon kodu">
            <input id={id("coupon")} className="input" maxLength={40} value={String(settings.couponCode ?? "")} onChange={(e) => set({ couponCode: e.target.value })} />
          </Field>
          <Field id={id("valid")} label="Geçerlilik (gün)">
            <input id={id("valid")} type="number" min={1} max={60} className="input" value={num("couponValidDays")} onChange={(e) => set({ couponValidDays: Number(e.target.value) })} />
          </Field>
          <Field id={id("hour")} label="Gönderim saati">
            <select id={id("hour")} className="input" value={num("sendHour")} onChange={(e) => set({ sendHour: Number(e.target.value) })}>
              {Array.from({ length: 12 }, (_, i) => i + 9).map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
            </select>
          </Field>
        </div>
      );
    case "chatbot":
      return (
        <Field id={id("hours")} label="Temsilci çalışma saatleri" hint={'"Temsilci" yazan müşteriye gösterilir.'}>
          <input id={id("hours")} className="input" maxLength={200} value={String(settings.supportHoursText ?? "")} onChange={(e) => set({ supportHoursText: e.target.value })} />
        </Field>
      );
    case "order_shipped":
      return (
        <p className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
          Şablondaki &quot;Kargom nerede?&quot; butonunun adresini CRM alan adınız + <code>{"{{takip_yolu}}"}</code> olarak girin
          (ör. <code>https://crm.magazaniz.com/{"{{takip_yolu}}"}</code>). Müşteri tıkladığında kargo firmasının takip sayfasına yönlendirilir.
        </p>
      );
    default:
      return null;
  }
}

export function AutomationCard({ item }: { item: AutomationItem }) {
  const [enabled, setEnabled] = useState(item.state.enabled);
  const [templateName, setTemplateName] = useState<string | null>(item.state.templateName ?? item.templates.find((t) => t.status === "approved")?.name ?? null);
  const [settings, setSettings] = useState<Settings>(item.state.settings);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const selected = item.templates.find((t) => t.name === templateName);

  const save = (nextEnabled = enabled) =>
    start(async () => {
      const r = await saveAutomationAction(item.key, { enabled: nextEnabled, templateName: item.trigger ? templateName : null, settings });
      if (r.ok) {
        setEnabled(nextEnabled);
        setMessage({ ok: true, text: nextEnabled ? "Kaydedildi, otomasyon açık." : "Kaydedildi, otomasyon kapalı." });
      } else {
        setMessage({ ok: false, text: r.error });
      }
    });

  return (
    <div className={`card flex flex-col gap-4 ${enabled ? "border-emerald-300" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{item.label}</h2>
          <p className="text-sm text-slate-600">{item.description}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`${item.label} ${enabled ? "açık" : "kapalı"}`}
          disabled={pending}
          onClick={() => save(!enabled)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition ${enabled ? "bg-emerald-600" : "bg-slate-300"} disabled:opacity-50`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${enabled ? "left-5.5" : "left-0.5"}`} />
        </button>
      </div>

      {item.trigger && (
        <div>
          <label className="label" htmlFor={`${item.key}-template`}>Şablon</label>
          {item.templates.length === 0 ? (
            <p className="text-sm text-slate-500">
              Uygun şablon yok. <Link href="/templates/new" className="text-emerald-700 underline">Şablon oluşturun</Link> (tetikleyici uygun olmalı ve Meta onayı almalı).
            </p>
          ) : (
            <>
              <select id={`${item.key}-template`} className="input font-mono" value={templateName ?? ""} onChange={(e) => setTemplateName(e.target.value || null)}>
                <option value="">Seçin…</option>
                {item.templates.map((t) => (
                  <option key={t.name} value={t.name}>{t.name} — {STATUS_LABELS[t.status]}</option>
                ))}
              </select>
              {selected && selected.status !== "approved" && (
                <p className="mt-1 text-xs text-amber-700">Bu şablon henüz onaylı değil; otomasyon açılamaz.</p>
              )}
            </>
          )}
        </div>
      )}

      <SettingsFields item={item} settings={settings} set={(patch) => setSettings((s) => ({ ...s, ...patch }))} />

      {message && <p className={`text-sm ${message.ok ? "text-emerald-700" : "text-red-600"}`}>{message.text}</p>}
      <div className="mt-auto">
        <button type="button" className="btn-secondary" disabled={pending} onClick={() => save()}>
          {pending ? "Kaydediliyor…" : "Ayarları kaydet"}
        </button>
      </div>
    </div>
  );
}
