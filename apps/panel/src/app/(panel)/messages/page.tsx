import { api } from "@/lib/api";
import { MESSAGE_STATUS_LABELS, SKIP_REASON_LABELS } from "@/lib/types";

function maskPhone(phone: string | null): string {
  if (!phone) return "—";
  return `${phone.slice(0, 5)}*****${phone.slice(-2)}`;
}

function reasonLabel(reason: string): string {
  if (reason.startsWith("missing_variables:")) return `Eksik değişken: ${reason.split(":")[1]}`;
  return SKIP_REASON_LABELS[reason] ?? reason;
}

export default async function MessagesPage() {
  const [messages, templates] = await Promise.all([api.messages(), api.templates()]);
  const names = new Map(templates.map((t) => [t.id, t.name]));
  const fmt = new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Son mesajlar</h1>
      {messages.length === 0 ? (
        <div className="card text-sm text-slate-500">Henüz gönderilmiş mesaj yok.</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">#</th>
                <th className="px-4 py-2 font-medium">Zaman</th>
                <th className="px-4 py-2 font-medium">Telefon</th>
                <th className="px-4 py-2 font-medium">Şablon</th>
                <th className="px-4 py-2 font-medium">Durum</th>
                <th className="px-4 py-2 font-medium">Ayrıntı</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((m) => (
                <tr key={m.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 text-slate-500">{m.id}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{fmt.format(new Date(m.createdAt))}</td>
                  <td className="px-4 py-2 font-mono">{maskPhone(m.phone)}</td>
                  <td className="px-4 py-2">{names.get(m.templateId) ?? m.templateId}</td>
                  <td className="px-4 py-2">{MESSAGE_STATUS_LABELS[m.status] ?? m.status}</td>
                  <td className="px-4 py-2 text-slate-500">
                    {m.skipReason ? reasonLabel(m.skipReason) : (m.errorMessage ?? "")}
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
