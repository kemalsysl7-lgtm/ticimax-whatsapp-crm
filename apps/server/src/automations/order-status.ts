import type { Order } from "../ticimax/mapper";
import type { AutomationKey } from "./definitions";

/**
 * Sipariş durum değişikliklerinden hangi bildirimlerin gideceğini belirler.
 *
 * - Yalnızca gerçek bir durum geçişi (önceki durum biliniyor) ya da son 3 gün içinde
 *   verilmiş yeni bir sipariş bildirim üretir.
 * - Sistemin ilk senkronunda (yerel kopya henüz boşken) hiçbir bildirim gitmez; aksi halde
 *   eski siparişlerin tamamı için mesaj atılırdı.
 */
export const STATUS_AUTOMATIONS: Record<number, AutomationKey> = {
  2: "order_confirmed",
  6: "order_shipped",
  7: "order_delivered",
};

const NEW_ORDER_WINDOW_MS = 3 * 86_400_000;

export interface PlannedOrderNotification {
  automation: AutomationKey;
  order: Order;
  dedupeKey: string;
}

export function planOrderNotifications(
  changes: ReadonlyArray<{ order: Order; previousStatus: number | null }>,
  opts: { initialized: boolean; now: Date },
): PlannedOrderNotification[] {
  if (!opts.initialized) return [];
  const plans: PlannedOrderNotification[] = [];
  for (const { order, previousStatus } of changes) {
    const automation = STATUS_AUTOMATIONS[order.statusCode];
    if (!automation) continue;
    const isFresh = order.orderedAt !== null && opts.now.getTime() - order.orderedAt.getTime() <= NEW_ORDER_WINDOW_MS;
    if (previousStatus === null && !isFresh) continue;
    plans.push({ automation, order, dedupeKey: `order:${order.ticimaxId}:status:${order.statusCode}` });
  }
  return plans;
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? "";
}
