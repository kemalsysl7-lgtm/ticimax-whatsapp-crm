import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiError, automationApi } from "@/lib/api";
import { formatDateTime, formatPhone } from "@/lib/format";
import { ReplyBox } from "./reply-box";

const AUTHOR_LABEL = { customer: "Müşteri", bot: "Asistan", agent: "Temsilci" } as const;

export default async function ConversationPage({ params }: { params: Promise<{ phone: string }> }) {
  const { phone } = await params;
  const c = await automationApi.conversation(phone).catch((err: unknown) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <Link href="/inbox" className="text-sm text-slate-500 hover:text-slate-900">← Gelen kutusu</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{c.profileName || formatPhone(c.phone)}</h1>
          <span className="text-sm text-slate-500">{formatPhone(c.phone)}</span>
          {c.memberId && <Link href={`/customers/${c.memberId}`} className="text-sm text-emerald-700 underline">Müşteri kartı</Link>}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto bg-wa-chat p-4">
          {c.messages.map((m) => (
            <div key={m.id} className={`max-w-[80%] rounded-lg px-3 py-2 text-sm shadow-sm ${m.direction === "in" ? "self-start bg-white" : m.author === "agent" ? "self-end bg-emerald-100" : "self-end bg-[#d9fdd3]"}`}>
              <p className="mb-0.5 text-[11px] font-medium text-slate-500">{AUTHOR_LABEL[m.author]}</p>
              <p className="whitespace-pre-wrap break-words">{m.text}</p>
              <p className="mt-1 text-right text-[10px] text-slate-400">{formatDateTime(m.createdAt)}</p>
            </div>
          ))}
        </div>
      </div>

      <ReplyBox phone={c.phone} windowOpen={c.windowOpen} windowClosesAt={c.windowClosesAt} needsHuman={c.needsHuman} />
    </div>
  );
}
