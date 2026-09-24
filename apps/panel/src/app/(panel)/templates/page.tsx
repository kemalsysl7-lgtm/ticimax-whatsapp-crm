import Link from "next/link";
import { api } from "@/lib/api";
import { STATUS_LABELS, type TemplateStatus } from "@/lib/types";

const STATUS_STYLES: Record<TemplateStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
  paused: "bg-orange-100 text-orange-800",
  disabled: "bg-slate-200 text-slate-500",
};

export default async function TemplatesPage() {
  const [templates, triggers] = await Promise.all([api.templates(), api.triggers()]);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Mesaj şablonları</h1>
        <Link href="/templates/new" className="btn-primary">
          Yeni şablon
        </Link>
      </div>

      {templates.length === 0 ? (
        <div className="card text-sm text-slate-500">
          Henüz şablon yok. Meta'nın onayladığı şablonlar olmadan müşteriye ilk mesaj gönderilemez; ilk şablonunuzu oluşturun.
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Ad</th>
                <th className="px-4 py-2 font-medium">Tetikleyici</th>
                <th className="px-4 py-2 font-medium">Kategori</th>
                <th className="px-4 py-2 font-medium">Durum</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link href={`/templates/${t.id}`} className="font-medium text-emerald-700 hover:underline">
                      {t.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{triggers[t.trigger]?.label ?? t.trigger}</td>
                  <td className="px-4 py-2">{t.category === "MARKETING" ? "Pazarlama" : "Bilgilendirme"}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[t.status]}`}>{STATUS_LABELS[t.status]}</span>
                    {t.status === "rejected" && t.rejectionReason && (
                      <span className="ml-2 text-xs text-red-600">{t.rejectionReason}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
