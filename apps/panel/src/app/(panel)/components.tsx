import Link from "next/link";
import { SEGMENT_TONES } from "@/lib/types";

export const SEGMENT_LABELS: Record<string, string> = {
  champions: "Şampiyon (VIP)",
  loyal: "Sadık",
  potential_loyal: "Potansiyel sadık",
  new: "Yeni",
  one_time: "Tek seferlik",
  at_risk: "Risk altında",
  sleeping: "Uyuyan",
  lost: "Kaybedilmiş",
  needs_attention: "İlgi bekleyen",
  no_orders: "Alışveriş yok",
};

export function SegmentBadge({ segment }: { segment: string | null }) {
  if (!segment) return <span className="text-xs text-slate-400">Hesaplanmadı</span>;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${SEGMENT_TONES[segment] ?? "bg-slate-100"}`}>
      {SEGMENT_LABELS[segment] ?? segment}
    </span>
  );
}

export function ConsentBadges({ consent }: { consent: { transactional: boolean; marketing: boolean } }) {
  const dot = (on: boolean, label: string) => (
    <span className={`inline-flex items-center gap-1 text-xs ${on ? "text-emerald-700" : "text-slate-400"}`} title={`${label}: ${on ? "izin var" : "izin yok"}`}>
      <span className={`h-2 w-2 rounded-full ${on ? "bg-emerald-500" : "bg-slate-300"}`} />
      {label}
    </span>
  );
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1">
      {dot(consent.transactional, "Bilgi")}
      {dot(consent.marketing, "Pazarlama")}
    </span>
  );
}

/** Sunucu tarafında çalışan sayfalama; mevcut filtreleri korur. */
export function Pagination({ basePath, params, page, pageSize, total }: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const q = new URLSearchParams(Object.entries({ ...params, page: String(p) }).filter(([, v]) => v) as [string, string][]);
    return `${basePath}?${q.toString()}`;
  };
  return (
    <div className="flex items-center justify-between text-sm text-slate-500">
      <span>
        Toplam {total.toLocaleString("tr-TR")} kayıt · Sayfa {page}/{pages}
      </span>
      <span className="flex gap-2">
        {page > 1 && <Link className="btn-secondary" href={href(page - 1)}>Önceki</Link>}
        {page < pages && <Link className="btn-secondary" href={href(page + 1)}>Sonraki</Link>}
      </span>
    </div>
  );
}
