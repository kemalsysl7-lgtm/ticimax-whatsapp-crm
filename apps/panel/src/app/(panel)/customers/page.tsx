import Link from "next/link";
import { api } from "@/lib/api";
import { daysAgo, formatMoney, formatPhone } from "@/lib/format";
import { ConsentBadges, Pagination, SEGMENT_LABELS, SegmentBadge } from "../components";

type Search = { q?: string; segment?: string; page?: string };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const data = await api.customers({ q: sp.q, segment: sp.segment, page });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Müşteriler</h1>
          <p className="text-sm text-slate-500">Ticimax üyeleri; segment, harcama ve WhatsApp izin durumuyla.</p>
        </div>
      </div>

      <form className="card flex flex-wrap items-end gap-3 p-4" action="/customers">
        <div className="min-w-56 flex-1">
          <label className="label" htmlFor="q">Ara</label>
          <input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Ad, e-posta veya telefon" className="input" />
        </div>
        <div className="w-56">
          <label className="label" htmlFor="segment">Segment</label>
          <select id="segment" name="segment" defaultValue={sp.segment ?? ""} className="input">
            <option value="">Tümü</option>
            {Object.entries(SEGMENT_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </div>
        <button className="btn-primary">Filtrele</button>
        {(sp.q || sp.segment) && <Link href="/customers" className="btn-secondary">Temizle</Link>}
      </form>

      {data.items.length === 0 ? (
        <div className="card text-sm text-slate-500">Bu filtreye uyan müşteri yok.</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm tabular-nums">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Müşteri</th>
                <th className="px-4 py-2 font-medium">Telefon</th>
                <th className="px-4 py-2 font-medium">Segment</th>
                <th className="px-4 py-2 text-right font-medium">Sipariş</th>
                <th className="px-4 py-2 text-right font-medium">Toplam</th>
                <th className="px-4 py-2 font-medium">Son alışveriş</th>
                <th className="px-4 py-2 font-medium">WhatsApp izni</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link href={`/customers/${c.id}`} className="font-medium text-emerald-700 hover:underline">{c.name || `Üye #${c.id}`}</Link>
                    <div className="text-xs text-slate-500">{c.email}</div>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">{formatPhone(c.phone)}</td>
                  <td className="px-4 py-2"><SegmentBadge segment={c.segment} /></td>
                  <td className="px-4 py-2 text-right">{c.orderCount}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">{formatMoney(c.totalSpent)}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{daysAgo(c.lastOrderAt)}</td>
                  <td className="px-4 py-2">{c.phone ? <ConsentBadges consent={c.consent} /> : <span className="text-xs text-slate-400">Telefon yok</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination basePath="/customers" params={{ q: sp.q, segment: sp.segment }} page={page} pageSize={data.pageSize} total={data.total} />
    </div>
  );
}
