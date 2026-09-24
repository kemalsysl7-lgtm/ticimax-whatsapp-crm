import { beforeEach, describe, expect, it } from "vitest";
import type { AutomationQueries } from "../db/automation-queries";
import { FakeMessageStore, FakeQueue, FakeTemplateStore, fixedClock } from "../messaging/fakes";
import type { StoredTemplate } from "../messaging/ports";
import { OPT_OUT_BUTTON_TEXT } from "../templates/template";
import type { Order } from "../ticimax/mapper";
import { parseSettings, type AutomationKey, type AutomationState } from "./definitions";
import { ORDERS_INITIALIZED_KEY, runAbandonedCarts, runBirthdays, runOrderNotifications, type RunnerDeps } from "./runner";
import { trackingPath, verifyTrackingRef } from "./tracking-link";

const shippedTemplate: StoredTemplate = {
  id: 1, name: "kargo_v1", language: "tr", category: "UTILITY", trigger: "order_status", status: "approved",
  body: "Merhaba {{ad}}, {{siparis_no}} numaralı siparişin {{kargo_firmasi}} ile yola çıktı.",
  buttons: [{ type: "URL", text: "Kargom nerede?", url: "https://crm.magaza.com/{{takip_yolu}}" }],
};
const cartTemplate: StoredTemplate = {
  id: 2, name: "sepet_v1", language: "tr", category: "MARKETING", trigger: "abandoned_cart", status: "approved",
  body: "Merhaba {{ad}}, sepetinde {{urun_sayisi}} ürün var ({{sepet_toplami}}).", footer: "Çıkmak için DUR yazın",
  buttons: [{ type: "QUICK_REPLY", text: OPT_OUT_BUTTON_TEXT }],
};
const birthdayTemplate: StoredTemplate = {
  id: 3, name: "dogumgunu_v1", language: "tr", category: "MARKETING", trigger: "birthday", status: "approved",
  body: "İyi ki doğdun {{ad}}! {{kupon_kodu}} kodu {{kupon_bitis}} tarihine kadar geçerli.", footer: "Çıkmak için DUR yazın", buttons: [],
};

class FakeQueries {
  automations = new Map<AutomationKey, AutomationState>();
  shipments: Array<{ id: number; info: unknown }> = [];
  carts: unknown[] = [];
  recent: Awaited<ReturnType<AutomationQueries["recentMemberCarts"]>> = [];
  birthdays: Array<{ id: number; firstName: string; phone: string }> = [];
  async getAutomation(key: AutomationKey) {
    return this.automations.get(key) ?? { key, enabled: false, templateName: null, settings: parseSettings(key, {}) };
  }
  enable(key: AutomationKey, templateName: string, settings: unknown = {}) {
    this.automations.set(key, { key, enabled: true, templateName, settings: parseSettings(key, settings) });
  }
  async member(id: number) {
    return id === 1 ? { firstName: "Ayşe", phone: "905321234567" } : null;
  }
  async setOrderShipment(id: number, info: unknown) {
    this.shipments.push({ id, info });
  }
  async upsertCarts(list: unknown[]) {
    this.carts.push(...list);
  }
  async recentMemberCarts() {
    return this.recent;
  }
  async membersWithBirthday() {
    return this.birthdays;
  }
}

let q: FakeQueries;
let deps: RunnerDeps & { messages: FakeMessageStore; queue: FakeQueue };
const cursors = new Map<string, string>();

beforeEach(() => {
  q = new FakeQueries();
  cursors.clear();
  deps = {
    queries: q as unknown as AutomationQueries,
    source: {
      selectShipmentPackages: async () => [{ carrierName: "Yurtiçi Kargo", trackingNo: "999", trackingLink: "https://kargo.example/999" }],
      selectCarts: async () => [],
      selectPriceAlarms: async () => [],
      selectStockAlarms: async () => [],
    },
    mirror: { getCursor: async (k) => cursors.get(k) ?? null, setCursor: async (k, v) => void cursors.set(k, v) },
    messages: new FakeMessageStore(),
    templates: new FakeTemplateStore([shippedTemplate, cartTemplate, birthdayTemplate]),
    queue: new FakeQueue(),
    clock: fixedClock("2026-09-24T12:00:00Z"),
    timezone: "Europe/Istanbul",
    trackingSecret: "s3cret",
    log: () => {},
  };
});

const order = (statusCode: number): Order => ({
  ticimaxId: 588, memberTicimaxId: 1, statusCode, statusName: "Kargoya verildi", customerName: "Ayşe Yılmaz",
  deliveryPhone: null, total: 100, currency: "TL", orderedAt: new Date("2026-09-23T10:00:00Z"), cargoCompanyId: 2, trackingNo: null,
});

describe("takip linki", () => {
  it("imzalı linki doğrular, oynanmış olanı reddeder", () => {
    const path = trackingPath(588, "s3cret");
    const ref = path.slice(2);
    expect(verifyTrackingRef(ref, "s3cret")).toBe(588);
    expect(verifyTrackingRef(ref.replace("588", "589"), "s3cret")).toBeNull();
    expect(verifyTrackingRef(ref, "baska")).toBeNull();
    expect(verifyTrackingRef("588", "s3cret")).toBeNull();
  });
});

describe("runOrderNotifications", () => {
  it("ilk çalıştırmada yalnızca hazır işareti koyar", async () => {
    q.enable("order_shipped", "kargo_v1");
    expect(await runOrderNotifications(deps, [{ order: order(6), previousStatus: 4 }])).toBe(0);
    expect(cursors.has(ORDERS_INITIALIZED_KEY)).toBe(true);
    expect(deps.messages.rows.size).toBe(0);
  });

  it("kargoya verilince kargo bilgisini çekip bildirim kuyruğa alır, tekrarında göndermez", async () => {
    cursors.set(ORDERS_INITIALIZED_KEY, "x");
    q.enable("order_shipped", "kargo_v1");
    expect(await runOrderNotifications(deps, [{ order: order(6), previousStatus: 4 }])).toBe(1);
    const [msg] = [...deps.messages.rows.values()];
    expect(msg).toMatchObject({ phone: "905321234567", dedupeKey: "order:588:status:6" });
    expect(msg!.variables).toMatchObject({ ad: "Ayşe", siparis_no: "588", kargo_firmasi: "Yurtiçi Kargo", takip_no: "999", takip_yolu: trackingPath(588, "s3cret") });
    expect(q.shipments).toHaveLength(1);
    expect(await runOrderNotifications(deps, [{ order: order(6), previousStatus: 4 }])).toBe(0);
  });

  it("otomasyon kapalıysa hiçbir şey göndermez", async () => {
    cursors.set(ORDERS_INITIALIZED_KEY, "x");
    expect(await runOrderNotifications(deps, [{ order: order(6), previousStatus: 4 }])).toBe(0);
  });
});

describe("runAbandonedCarts", () => {
  it("zamanı gelen sepete hatırlatma kuyruğa alır", async () => {
    q.enable("abandoned_cart", "sepet_v1");
    q.recent = [{
      cartId: 73, memberTicimaxId: 1, updatedAt: new Date("2026-09-24T08:00:00Z"),
      items: [{ name: "Keten Gömlek", quantity: 2, unitPrice: 600 }, { name: "Kemer", quantity: 1, unitPrice: 49.9 }],
      total: 1249.9, firstName: "Ayşe", phone: "905321234567", lastOrderAt: null,
    }];
    expect(await runAbandonedCarts(deps)).toEqual({ carts: 0, queued: 1 });
    const [msg] = [...deps.messages.rows.values()];
    expect(msg!.variables).toMatchObject({ ad: "Ayşe", urun_sayisi: "3", ilk_urun_adi: "Keten Gömlek", sepet_toplami: "1.249,90 TL", sepet_yolu: "sepet" });
  });
});

describe("runBirthdays", () => {
  it("gönderim saatinden sonra günde bir kez çalışır", async () => {
    q.enable("birthday", "dogumgunu_v1", { couponCode: "DGUN20", sendHour: 10 });
    q.birthdays = [{ id: 1, firstName: "Ayşe", phone: "905321234567" }];
    deps.clock = fixedClock("2026-09-24T06:00:00Z"); // 09:00 İstanbul, saat gelmedi
    expect(await runBirthdays(deps)).toBeNull();
    deps.clock = fixedClock("2026-09-24T08:00:00Z"); // 11:00
    expect(await runBirthdays(deps)).toBe(1);
    expect([...deps.messages.rows.values()][0]!.variables).toEqual({ ad: "Ayşe", kupon_kodu: "DGUN20", kupon_bitis: "01.10.2026" });
    expect(await runBirthdays(deps)).toBeNull();
  });
});
