import Link from "next/link";
import { api } from "@/lib/api";
import { formatDateTime, formatMoney } from "@/lib/format";
import { SEGMENT_TONES } from "@/lib/types";
import { RecomputeButton } from "./recompute-button";

/** Aksiyon gerektiren segmentler üstte, sonra değerli olanlar. */
const ORDER = ["at_risk", "sleeping", "champions", "loyal", "potential_loyal", "new", "one_time", "lost", "needs_attention", "no_orders"];

export default async function SegmentsPage() {
  const data = await api.segments();
  const total = data.segments.reduce((a, s) => a + s.customers, 0);
  const revenue = data.segments.reduce((a, s) => a + s.revenue, 0);
  const sorted = [...data.segments].sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
  const byKey = Object.fromEntries(data.segments.map((s) => [s.key, s]));
  const attention = (byKey.at_risk?.customers ?? 0) + (byKey.sleeping?.customers ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Müşteri segmentleri</h1>
          <p className="text-sm text-slate-500">
            RFM analizi: son alışveriş zamanı, alışveriş sıklığı ve toplam harcamaya göre.{" "}
            {data.computedAt ? `Son hesaplama: ${formatDateTime(data.computedAt)}` : "Henüz hesaplanmadı."}
          </p>
        </div>
        <RecomputeButton />
      </div>

      {total === 0 ? (
        <div className="card text-sm text-slate-500">
          Segmentler, Ticimax'ten üye ve sipariş verisi geldikten sonra otomatik hesaplanır. Veri geldiyse &quot;Yeniden hesapla&quot;ya basın.
        </div>
      ) : (
        <>
          <div className="card grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs tracking-wide text-slate-500 uppercase">Müşteri</p>
              <p className="text-2xl font-semibold tabular-nums">{total.toLocaleString("tr-TR")}</p>
            </div>
            <div>
              <p className="text-xs tracking-wide text-slate-500 uppercase">Toplam ciro</p>
              <p className="text-2xl font-semibold tabular-nums">{formatMoney(revenue)}</p>
            </div>
            <div>
              <p className="text-xs tracking-wide text-slate-500 uppercase">VIP'lerin ciro payı</p>
              <p className="text-2xl font-semibold tabular-nums">%{revenue ? Math.round(((byKey.champions?.revenue ?? 0) / revenue) * 100) : 0}</p>
              <p className="text-xs text-slate-500">müşterilerin %{total ? Math.round(((byKey.champions?.customers ?? 0) / total) * 100) : 0}&apos;i</p>
            </div>
            <div>
              <p className="text-xs tracking-wide text-slate-500 uppercase">Geri kazanılmalı</p>
              <p className="text-2xl font-semibold tabular-nums text-amber-700">{attention.toLocaleString("tr-TR")}</p>
              <p className="text-xs text-slate-500">risk altında + uyuyan</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {sorted.map((s) => {
              const share = total ? (s.customers / total) * 100 : 0;
              return (
                <div key={s.key} className="card flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEGMENT_TONES[s.key]}`}>{s.label}</span>
                      <p className="mt-2 text-sm text-slate-600">{s.description}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-semibold tabular-nums">{s.customers.toLocaleString("tr-TR")}</p>
                      <p className="text-xs text-slate-500">%{share.toFixed(1)}</p>
                    </div>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(share, s.customers ? 1 : 0)}%` }} />
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-sm tabular-nums">
                    <div><dt className="text-xs text-slate-500">Ciro</dt><dd>{formatMoney(s.revenue)}</dd></div>
                    <div><dt className="text-xs text-slate-500">Ort. sipariş</dt><dd>{s.avgOrders || "—"}</dd></div>
                    <div><dt className="text-xs text-slate-500">Telefonlu</dt><dd>{s.withPhone.toLocaleString("tr-TR")}</dd></div>
                  </dl>
                  <p className="text-xs text-slate-500">Öneri: {s.action}</p>
                  <div className="mt-auto flex flex-wrap gap-2">
                    <Link href={`/customers?segment=${s.key}`} className="btn-secondary">Müşterileri gör</Link>
                    {s.withPhone > 0 && <Link href={`/campaigns/new?segment=${s.key}`} className="btn-primary">Kampanya gönder</Link>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
