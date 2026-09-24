import { describe, expect, it, vi } from "vitest";
import { FakeConsentStore, fixedClock } from "../messaging/fakes";
import type { Member, Order } from "../ticimax/mapper";
import {
  HISTORY_WINDOWS_PER_RUN,
  MEMBER_CURSOR_KEY,
  ORDER_HISTORY_CURSOR_KEY,
  PAGE_SIZE,
  syncMembers,
  syncOrderHistory,
  syncOrders,
  type MirrorStore,
} from "./sync";

describe("syncOrderHistory", () => {
  const mirror = () => new FakeMirrorForHistory();
  class FakeMirrorForHistory implements MirrorStore {
    cursors = new Map<string, string>();
    async upsertMembers() {}
    async upsertOrders() {
      return [];
    }
    async getCursor(key: string) {
      return this.cursors.get(key) ?? null;
    }
    async setCursor(key: string, cursor: string) {
      this.cursors.set(key, cursor);
    }
  }

  it("geçmişi 90 günlük pencerelerle, tur başına sınırlı okur ve kaldığı yerden devam eder", async () => {
    const m = mirror();
    const selectOrders = vi.fn(async (_p: { from: Date; to: Date; offset: number }) => [] as Order[]);
    const deps = { source: { selectMembers: vi.fn(), selectOrders }, mirror: m, consents: new FakeConsentStore(), clock: fixedClock("2026-09-24T12:00:00Z") };

    const first = await syncOrderHistory(deps, new Date("2022-01-01T00:00:00Z"));
    expect(first).toMatchObject({ windows: HISTORY_WINDOWS_PER_RUN, done: false });
    expect(selectOrders.mock.calls[0]![0]).toMatchObject({ from: new Date("2022-01-01T00:00:00Z"), to: new Date("2022-04-01T00:00:00Z") });

    let result = first;
    for (let i = 0; i < 10 && !result.done; i++) result = await syncOrderHistory(deps, new Date("2022-01-01T00:00:00Z"));
    expect(result.done).toBe(true);
    // Son pencere, son 30 günün başında (syncOrders'ın okuduğu aralık) biter.
    expect(m.cursors.get(ORDER_HISTORY_CURSOR_KEY)).toBe("2026-08-25T12:00:00.000Z");
    const again = await syncOrderHistory(deps, new Date("2022-01-01T00:00:00Z"));
    expect(again).toEqual({ orders: 0, windows: 0, done: true });
  });
});

const member = (id: number, sms = true, phone: string | null = `9053200000${String(id).padStart(2, "0")}`): Member => ({
  ticimaxId: id,
  firstName: "Ad",
  lastName: "Soyad",
  email: null,
  phone,
  birthDate: null,
  smsPermission: sms,
  mailPermission: false,
  memberTypeId: null,
  updatedAt: null,
});

class FakeMirror implements MirrorStore {
  members = new Map<number, Member>();
  orders = new Map<number, Order>();
  cursors = new Map<string, string>();
  async upsertMembers(list: Member[]) {
    list.forEach((m) => this.members.set(m.ticimaxId, m));
  }
  async upsertOrders(list: Order[]) {
    const changes = list
      .filter((o) => this.orders.get(o.ticimaxId)?.statusCode !== o.statusCode)
      .map((o) => ({ order: o, previousStatus: this.orders.get(o.ticimaxId)?.statusCode ?? null }));
    list.forEach((o) => this.orders.set(o.ticimaxId, o));
    return changes;
  }
  async getCursor(key: string) {
    return this.cursors.get(key) ?? null;
  }
  async setCursor(key: string, cursor: string) {
    this.cursors.set(key, cursor);
  }
}

const clock = fixedClock("2026-09-24T12:00:00Z");

describe("syncMembers", () => {
  it("ilk turda tarih filtresi olmadan tüm sayfaları okur ve imleci kaydeder", async () => {
    const all = Array.from({ length: PAGE_SIZE + 5 }, (_, i) => member(i + 1));
    const selectMembers = vi.fn(async ({ page }: { page: number }) => all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE));
    const mirror = new FakeMirror();
    const consents = new FakeConsentStore();

    const result = await syncMembers({ source: { selectMembers, selectOrders: vi.fn() }, mirror, consents, clock });

    expect(result).toEqual({ members: PAGE_SIZE + 5, consentChanges: (PAGE_SIZE + 5) * 2 });
    expect(selectMembers).toHaveBeenCalledTimes(2);
    expect(selectMembers.mock.calls[0]![0]).toMatchObject({ updatedFrom: undefined, page: 1 });
    expect(mirror.cursors.get(MEMBER_CURSOR_KEY)).toBe("2026-09-24T12:00:00.000Z");
  });

  it("sonraki turda imlecin 10 dakika gerisinden başlar ve izni tekrar eklemez", async () => {
    const mirror = new FakeMirror();
    mirror.cursors.set(MEMBER_CURSOR_KEY, "2026-09-24T11:00:00.000Z");
    const consents = new FakeConsentStore();
    const selectMembers = vi.fn(async (_p: { updatedFrom?: Date; page: number }) => [member(1)]);
    const deps = { source: { selectMembers, selectOrders: vi.fn() }, mirror, consents, clock };

    await syncMembers(deps);
    await syncMembers(deps);

    expect(selectMembers.mock.calls[0]![0]).toMatchObject({ updatedFrom: new Date("2026-09-24T10:50:00.000Z") });
    expect(consents.records).toHaveLength(2); // ilk turda marketing + transactional; ikinci turda değişiklik yok
  });

  it("telefonu olmayan üye için izin kaydı oluşturmaz", async () => {
    const consents = new FakeConsentStore();
    await syncMembers({
      source: { selectMembers: async () => [member(1, true, null)], selectOrders: vi.fn() },
      mirror: new FakeMirror(),
      consents,
      clock,
    });
    expect(consents.records).toHaveLength(0);
  });
});

describe("syncOrders", () => {
  const order = (id: number, statusCode: number): Order => ({
    ticimaxId: id,
    memberTicimaxId: 1,
    statusCode,
    statusName: "",
    customerName: "",
    deliveryPhone: null,
    total: 10,
    currency: "TL",
    orderedAt: null,
    cargoCompanyId: null,
    trackingNo: null,
  });

  it("son 30 günü okur ve yalnızca durumu değişen siparişleri raporlar", async () => {
    const mirror = new FakeMirror();
    mirror.orders.set(1, order(1, 4));
    const selectOrders = vi.fn(async (_p: { from: Date; to: Date; offset: number }) => [order(1, 6), order(2, 2)]);

    const result = await syncOrders({ source: { selectMembers: vi.fn(), selectOrders }, mirror, consents: new FakeConsentStore(), clock });

    expect(selectOrders.mock.calls[0]![0]).toMatchObject({ from: new Date("2026-08-25T12:00:00Z"), to: new Date("2026-09-24T12:00:00Z"), offset: 0 });
    expect(result.statusChanges.map((c) => [c.order.ticimaxId, c.previousStatus, c.order.statusCode])).toEqual([
      [1, 4, 6],
      [2, null, 2],
    ]);
  });
});
