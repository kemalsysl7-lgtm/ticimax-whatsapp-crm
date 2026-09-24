import { automationApi } from "@/lib/api";
import { AutomationCard } from "./automation-card";
import { RunNowButton } from "./run-now-button";

export default async function AutomationsPage() {
  const items = await automationApi.list();
  const active = items.filter((i) => i.state.enabled).length;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Otomasyonlar</h1>
          <p className="text-sm text-slate-500">
            {active} / {items.length} otomasyon açık. Otomasyonlar her senkron turunda (varsayılan 15 dakikada bir) çalışır;
            izin, sessiz saat ve haftalık sınır kuralları her mesajda uygulanır.
          </p>
        </div>
        <RunNowButton />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {items.map((item) => (
          <AutomationCard key={item.key} item={item} />
        ))}
      </div>
    </div>
  );
}
