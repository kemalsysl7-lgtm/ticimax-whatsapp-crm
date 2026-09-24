import { consentRecordsFromTicimax } from "../consent/ticimax-consent";
import type { Clock, ConsentStore } from "../messaging/ports";
import type { Member, Order } from "../ticimax/mapper";

/**
 * Ticimax → yerel kopya senkronu. Ticimax webhook göndermediği için periyodik çalışır.
 * Her adım idempotenttir: aynı sayfa iki kez işlense de sonuç değişmez.
 */
export interface SyncSource {
  selectMembers(p: { updatedFrom?: Date; updatedTo?: Date; page: number; pageSize: number }): Promise<Member[]>;
  selectOrders(p: { from: Date; to: Date; offset: number; pageSize: number }): Promise<Order[]>;
}

export interface MirrorStore {
  upsertMembers(list: Member[]): Promise<void>;
  upsertOrders(list: Order[]): Promise<Array<{ order: Order; previousStatus: number | null }>>;
  getCursor(key: string): Promise<string | null>;
  setCursor(key: string, cursor: string): Promise<void>;
}

export interface SyncDeps {
  source: SyncSource;
  mirror: MirrorStore;
  consents: ConsentStore;
  clock: Clock;
}

export const MEMBER_CURSOR_KEY = "members.updated_at";
export const PAGE_SIZE = 100;
/** Sipariş durumları sipariş tarihinden sonra değiştiği için son N günün siparişleri her turda yeniden okunur. */
export const ORDER_LOOKBACK_DAYS = 30;
/** Saat farkı ve gecikmeli yazımlara karşı imleç biraz geriden başlatılır. */
const CURSOR_OVERLAP_MS = 10 * 60_000;

export async function syncMembers(deps: SyncDeps): Promise<{ members: number; consentChanges: number }> {
  const startedAt = deps.clock.now();
  const cursor = await deps.mirror.getCursor(MEMBER_CURSOR_KEY);
  const updatedFrom = cursor ? new Date(new Date(cursor).getTime() - CURSOR_OVERLAP_MS) : undefined;

  let total = 0;
  let consentChanges = 0;
  for (let page = 1; ; page++) {
    const batch = await deps.source.selectMembers({
      updatedFrom,
      updatedTo: updatedFrom ? startedAt : undefined,
      page,
      pageSize: PAGE_SIZE,
    });
    await deps.mirror.upsertMembers(batch);
    total += batch.length;

    for (const member of batch) {
      if (!member.phone) continue;
      const existing = await deps.consents.recordsFor(member.phone);
      for (const record of consentRecordsFromTicimax(member.smsPermission, existing, startedAt)) {
        await deps.consents.append({ ...record, phone: member.phone, memberTicimaxId: member.ticimaxId });
        consentChanges++;
      }
    }
    if (batch.length < PAGE_SIZE) break;
  }

  await deps.mirror.setCursor(MEMBER_CURSOR_KEY, startedAt.toISOString());
  return { members: total, consentChanges };
}

export async function syncOrders(
  deps: SyncDeps,
): Promise<{ orders: number; statusChanges: Array<{ order: Order; previousStatus: number | null }> }> {
  const to = deps.clock.now();
  const from = new Date(to.getTime() - ORDER_LOOKBACK_DAYS * 86_400_000);
  let total = 0;
  const statusChanges: Array<{ order: Order; previousStatus: number | null }> = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const batch = await deps.source.selectOrders({ from, to, offset, pageSize: PAGE_SIZE });
    statusChanges.push(...(await deps.mirror.upsertOrders(batch)));
    total += batch.length;
    if (batch.length < PAGE_SIZE) break;
  }
  return { orders: total, statusChanges };
}
