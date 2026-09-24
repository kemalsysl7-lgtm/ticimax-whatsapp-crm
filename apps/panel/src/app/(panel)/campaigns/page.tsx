import Link from "next/link";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { SegmentBadge } from "../components";

export default async function CampaignsPage() {
  const campaigns = await api.campaigns();
  const pct = (n: number, d: number) => (d ? `%${Math.round((n / d) * 100)}` : "—");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Kampanyalar</h1>
          <p className="text-sm text-slate-500">Bir müşteri segmentine onaylı şablonla toplu WhatsApp mesajı.</p>
        </div>
        <Link href="/campaigns/new" className="btn-primary">Yeni kampanya</Link>
      </div>
      {campaigns.length === 0 ? (
        <div className="card text-sm text-slate-500">
          Henüz kampanya yok. <Link href="/segments" className="text-emerald-700 underline">Segmentler</Link> sayfasından bir gruba kampanya gönderebilirsiniz.
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm tabular-nums">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Kampanya</th>
                <th className="px-4 py-2 font-medium">Segment</th>
                <th className="px-4 py-2 text-right font-medium">Kitle</th>
                <th className="px-4 py-2 text-right font-medium">Gönderilen</th>
                <th className="px-4 py-2 text-right font-medium">İletilen</th>
                <th className="px-4 py-2 text-right font-medium">Okunan</th>
                <th className="px-4 py-2 text-right font-medium">Atlanan</th>
                <th className="px-4 py-2 text-right font-medium">Başarısız</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-slate-500"><span className="font-mono">{c.templateName}</span> · {formatDateTime(c.createdAt)}
                      {c.pending > 0 && ` · ${c.pending} bekliyor`}</div>
                  </td>
                  <td className="px-4 py-2"><SegmentBadge segment={c.segment} /></td>
                  <td className="px-4 py-2 text-right">{c.audienceSize}</td>
                  <td className="px-4 py-2 text-right">{c.sent}</td>
                  <td className="px-4 py-2 text-right">{c.delivered} <span className="text-xs text-slate-500">{pct(c.delivered, c.sent)}</span></td>
                  <td className="px-4 py-2 text-right">{c.read} <span className="text-xs text-slate-500">{pct(c.read, c.sent)}</span></td>
                  <td className="px-4 py-2 text-right text-slate-500" title="İzin yok, haftalık sınır vb.">{c.skipped}</td>
                  <td className="px-4 py-2 text-right text-red-700">{c.failed || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500">
        Atlananlar: pazarlama izni olmayan veya bu hafta sınır sayıda pazarlama mesajı almış müşteriler. Sessiz saatte (21:00–09:00) başlatılan kampanyalar sabah gönderilir.
      </p>
    </div>
  );
}
