import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { daysAgo, formatDate, formatDateTime, formatMoney, formatPhone } from "@/lib/format";
import { CONSENT_SOURCE_LABELS, MESSAGE_STATUS_LABELS, SKIP_REASON_LABELS } from "@/lib/types";
import { ConsentBadges, SegmentBadge } from "../../components";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await api.customer(Number(id)).catch((err: unknown) => {
    if (err instanceof ApiError && (err.status === 404 || err.status === 400)) notFound();
    throw err;
  });

  const stat = (label: string, value: string, hint?: string) => (
    <div>
      <p className="text-xs tracking-wide text-slate-500 uppercase">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/customers" className="text-sm text-slate-500 hover:text-slate-900">← Müşteriler</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{c.name || `Üye #${c.id}`}</h1>
          <SegmentBadge segment={c.segment?.key ?? null} />
        </div>
        <p className="text-sm text-slate-500">
          Ticimax üye no {c.id} · {c.email ?? "e-posta yok"} · {formatPhone(c.phone)}
          {c.birthDate && ` · Doğum tarihi ${formatDate(c.birthDate)}`}
        </p>
      </div>

      <div className="card grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stat("Sipariş", String(c.segment?.orderCount ?? 0), "iptal/iade hariç")}
        {stat("Toplam harcama", formatMoney(c.segment?.totalSpent ?? 0))}
        {stat("Son alışveriş", daysAgo(c.segment?.lastOrderAt ?? null), c.segment?.lastOrderAt ? formatDate(c.segment.lastOrderAt) : undefined)}
        {stat("RFM puanı", c.segment && c.segment.r ? `${c.segment.r}-${c.segment.f}-${c.segment.m}` : "—", "yenilik · sıklık · tutar (1-5)")}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">WhatsApp izinleri</h2>
            {c.phone && <ConsentBadges consent={c.consent} />}
          </div>
          {!c.phone ? (
            <p className="text-sm text-slate-500">Geçerli bir cep telefonu olmadığı için WhatsApp mesajı gönderilemez.</p>
          ) : c.consentHistory.length === 0 ? (
            <p className="text-sm text-slate-500">İzin kaydı yok. Ticimax'te SMS izni açılırsa bir sonraki senkronda eklenir.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {c.consentHistory.map((h, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>
                    {h.purpose === "marketing" ? "Pazarlama" : "Bilgilendirme"}:{" "}
                    <b className={h.granted ? "text-emerald-700" : "text-red-700"}>{h.granted ? "verildi" : "geri alındı"}</b>
                    <span className="text-slate-500"> · {CONSENT_SOURCE_LABELS[h.source] ?? h.source}{h.evidence?.note ? ` (${h.evidence.note})` : ""}</span>
                  </span>
                  <span className="text-slate-500 tabular-nums">{formatDateTime(h.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card space-y-3">
          <h2 className="font-semibold">Gönderilen mesajlar</h2>
          {c.messages.length === 0 ? (
            <p className="text-sm text-slate-500">Bu müşteriye henüz mesaj gönderilmedi.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {c.messages.map((m) => (
                <li key={m.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>
                    <span className="font-mono">{m.templateName}</span>
                    <span className="text-slate-500"> · {MESSAGE_STATUS_LABELS[m.status] ?? m.status}
                      {m.skipReason ? ` (${SKIP_REASON_LABELS[m.skipReason] ?? m.skipReason})` : ""}</span>
                  </span>
                  <span className="text-slate-500 tabular-nums">{formatDateTime(m.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card overflow-x-auto p-0">
        <h2 className="px-5 pt-4 pb-2 font-semibold">Siparişler</h2>
        {c.orders.length === 0 ? (
          <p className="px-5 pb-4 text-sm text-slate-500">Sipariş yok.</p>
        ) : (
          <table className="w-full text-sm tabular-nums">
            <thead className="border-y border-slate-200 bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-5 py-2 font-medium">Sipariş no</th>
                <th className="px-5 py-2 font-medium">Tarih</th>
                <th className="px-5 py-2 font-medium">Durum</th>
                <th className="px-5 py-2 text-right font-medium">Tutar</th>
                <th className="px-5 py-2 font-medium">Kargo takip</th>
              </tr>
            </thead>
            <tbody>
              {c.orders.map((o) => (
                <tr key={o.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-5 py-2">{o.id}</td>
                  <td className="px-5 py-2 whitespace-nowrap">{formatDate(o.orderedAt)}</td>
                  <td className={`px-5 py-2 ${[8, 9, 10, 13].includes(o.statusCode) ? "text-slate-400 line-through" : ""}`}>{o.statusName}</td>
                  <td className="px-5 py-2 text-right whitespace-nowrap">{formatMoney(o.total)}</td>
                  <td className="px-5 py-2 font-mono text-xs">{o.trackingNo ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
