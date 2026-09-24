import Link from "next/link";
import { api } from "@/lib/api";
import { formatDateTime, formatMoney } from "@/lib/format";
import { ORDER_STATUS_OPTIONS } from "@/lib/types";
import { Pagination } from "../components";

type Search = { q?: string; status?: string; page?: string };

const STATUS_TONE = (code: number) =>
  code === 7 ? "bg-emerald-100 text-emerald-800"
  : code === 6 ? "bg-sky-100 text-sky-800"
  : [8, 9, 10, 13].includes(code) ? "bg-slate-100 text-slate-500"
  : [11, 12, 14, 15, 16, 17].includes(code) ? "bg-amber-100 text-amber-800"
  : "bg-indigo-100 text-indigo-800";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const data = await api.orders({ q: sp.q, status: sp.status, page });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Siparişler</h1>
        <p className="text-sm text-slate-500">Ticimax'ten senkronlanan siparişler. Son 30 günün siparişleri her senkron turunda güncellenir.</p>
      </div>

      <form className="card flex flex-wrap items-end gap-3 p-4" action="/orders">
        <div className="min-w-56 flex-1">
          <label className="label" htmlFor="q">Ara</label>
          <input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Sipariş no, müşteri adı veya takip no" className="input" />
        </div>
        <div className="w-56">
          <label className="label" htmlFor="status">Durum</label>
          <select id="status" name="status" defaultValue={sp.status ?? ""} className="input">
            <option value="">Tümü</option>
            {ORDER_STATUS_OPTIONS.map(([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>
        </div>
        <button className="btn-primary">Filtrele</button>
        {(sp.q || sp.status) && <Link href="/orders" className="btn-secondary">Temizle</Link>}
      </form>

      {data.items.length === 0 ? (
        <div className="card text-sm text-slate-500">Bu filtreye uyan sipariş yok.</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm tabular-nums">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Sipariş no</th>
                <th className="px-4 py-2 font-medium">Tarih</th>
                <th className="px-4 py-2 font-medium">Müşteri</th>
                <th className="px-4 py-2 font-medium">Durum</th>
                <th className="px-4 py-2 text-right font-medium">Tutar</th>
                <th className="px-4 py-2 font-medium">Kargo takip</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((o) => (
                <tr key={o.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2">{o.id}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{formatDateTime(o.orderedAt)}</td>
                  <td className="px-4 py-2">
                    {o.memberId ? <Link href={`/customers/${o.memberId}`} className="text-emerald-700 hover:underline">{o.customerName}</Link> : o.customerName}
                  </td>
                  <td className="px-4 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_TONE(o.statusCode)}`}>{o.statusName}</span></td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">{formatMoney(o.total)}</td>
                  <td className="px-4 py-2 font-mono text-xs">{o.trackingNo ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination basePath="/orders" params={{ q: sp.q, status: sp.status }} page={page} pageSize={data.pageSize} total={data.total} />
    </div>
  );
}
