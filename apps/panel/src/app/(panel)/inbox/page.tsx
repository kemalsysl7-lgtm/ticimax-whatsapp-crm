import Link from "next/link";
import { automationApi } from "@/lib/api";
import { daysAgo, formatDateTime, formatPhone } from "@/lib/format";

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { filter } = await searchParams;
  const conversations = await automationApi.inbox(filter === "needs_human" ? "needs_human" : undefined);
  const tab = (value: string | undefined, label: string) => (
    <Link
      href={value ? `/inbox?filter=${value}` : "/inbox"}
      className={`rounded-md px-3 py-1.5 text-sm ${filter === value ? "bg-slate-200 font-medium text-slate-900" : "text-slate-600 hover:bg-slate-100"}`}
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Gelen kutusu</h1>
        <p className="text-sm text-slate-500">WhatsApp&apos;tan yazan müşteriler. Asistan yanıtlayamadığında veya müşteri &quot;temsilci&quot; istediğinde konuşma işaretlenir.</p>
      </div>
      <div className="flex gap-2">
        {tab(undefined, "Tümü")}
        {tab("needs_human", "Temsilci bekleyen")}
      </div>
      {conversations.length === 0 ? (
        <div className="card text-sm text-slate-500">Konuşma yok.</div>
      ) : (
        <ul className="card divide-y divide-slate-100 p-0">
          {conversations.map((c) => (
            <li key={c.phone}>
              <Link href={`/inbox/${c.phone}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{c.name || formatPhone(c.phone)}</span>
                    {c.name && <span className="text-xs text-slate-500">{formatPhone(c.phone)}</span>}
                    {c.needsHuman && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Temsilci bekliyor</span>}
                  </div>
                  <p className="truncate text-sm text-slate-600">{c.preview}</p>
                </div>
                <span className="text-xs whitespace-nowrap text-slate-500" title={formatDateTime(c.lastMessageAt)}>{daysAgo(c.lastMessageAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
