import { describe, expect, it } from "vitest";
import { composeReply, detectIntent, normalize, type BotOrder } from "../chatbot/bot";
import type { Order } from "../ticimax/mapper";
import { planCartReminders, formatTl, type CartSnapshot } from "./abandoned-cart";
import { backInStock, dropPercent, priceDropped, productPath } from "./alarms";
import { addDays, formatDateTr, isBirthdayToday, localDateParts } from "./birthday";
import { AUTOMATIONS, SETTINGS_SCHEMAS, parseSettings } from "./definitions";
import { planOrderNotifications } from "./order-status";

const now = new Date("2026-09-24T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

const order = (id: number, statusCode: number, orderedAt: Date | null = hoursAgo(10)): Order => ({
  ticimaxId: id,
  memberTicimaxId: 1,
  statusCode,
  statusName: "",
  customerName: "Ayşe Yılmaz",
  deliveryPhone: null,
  total: 100,
  currency: "TL",
  orderedAt,
  cargoCompanyId: null,
  trackingNo: null,
});

describe("definitions", () => {
  it("her otomasyonun ayar şeması var ve bozuk ayar varsayılana döner", () => {
    for (const a of AUTOMATIONS) expect(SETTINGS_SCHEMAS[a.key]).toBeDefined();
    expect(parseSettings("abandoned_cart", { delaysHours: "bozuk" })).toMatchObject({ delaysHours: [2, 24, 72] });
    expect(parseSettings("birthday", { sendHour: 11 })).toMatchObject({ sendHour: 11, couponValidDays: 7 });
  });
});

describe("planOrderNotifications", () => {
  it("ilk senkronda hiçbir bildirim üretmez", () => {
    expect(planOrderNotifications([{ order: order(1, 6), previousStatus: 4 }], { initialized: false, now })).toEqual([]);
  });

  it("durum geçişlerini ilgili otomasyona eşler", () => {
    const plans = planOrderNotifications(
      [
        { order: order(1, 6), previousStatus: 4 },
        { order: order(2, 7), previousStatus: 6 },
        { order: order(3, 4), previousStatus: 2 },
        { order: order(4, 2), previousStatus: 1 },
      ],
      { initialized: true, now },
    );
    expect(plans.map((p) => [p.order.ticimaxId, p.automation, p.dedupeKey])).toEqual([
      [1, "order_shipped", "order:1:status:6"],
      [2, "order_delivered", "order:2:status:7"],
      [4, "order_confirmed", "order:4:status:2"],
    ]);
  });

  it("ilk kez görülen eski siparişe bildirim göndermez, yeni siparişe gönderir", () => {
    const plans = planOrderNotifications(
      [
        { order: order(1, 7, hoursAgo(24 * 20)), previousStatus: null },
        { order: order(2, 2, hoursAgo(2)), previousStatus: null },
      ],
      { initialized: true, now },
    );
    expect(plans.map((p) => p.order.ticimaxId)).toEqual([2]);
  });
});

describe("planCartReminders", () => {
  const cart = (id: number, updatedHoursAgo: number, itemCount = 2): CartSnapshot => ({
    cartId: id, memberTicimaxId: id, updatedAt: hoursAgo(updatedHoursAgo), itemCount, firstItemName: "Keten Gömlek", total: 1249.9,
  });

  it("zamanı gelmiş en son kademeyi planlar", () => {
    const plans = planCartReminders([cart(1, 1), cart(2, 3), cart(3, 30), cart(4, 100)], new Map(), [2, 24, 72], now);
    expect(plans.map((p) => [p.cart.cartId, p.step])).toEqual([[2, 0], [3, 1], [4, 2]]);
    expect(plans[0]!.dedupeKey).toBe(`cart:2:${hoursAgo(3).toISOString()}:step:0`);
  });

  it("sepetten sonra sipariş verildiyse, sepet boşsa veya 7 günden eskiyse planlamaz", () => {
    const plans = planCartReminders(
      [cart(1, 5), cart(2, 5, 0), cart(3, 24 * 8)],
      new Map([[1, hoursAgo(1)]]),
      [2, 24, 72],
      now,
    );
    expect(plans).toEqual([]);
  });

  it("sepetten önceki sipariş hatırlatmayı engellemez", () => {
    expect(planCartReminders([cart(1, 5)], new Map([[1, hoursAgo(48)]]), [2], now)).toHaveLength(1);
  });

  it("TL biçimi", () => expect(formatTl(1249.9)).toBe("1.249,90 TL"));
});

describe("alarmlar", () => {
  const alarm = (added: number, current: number) => ({
    alarmId: 1, memberTicimaxId: 1, productName: "Gömlek", productUrl: "https://magaza.com/keten-gomlek?renk=mavi", priceWhenAdded: added, currentPrice: current,
  });

  it("fiyat düşüşünü eşik yüzdesine göre değerlendirir", () => {
    expect(priceDropped(alarm(1000, 940), 5)).toBe(true);
    expect(priceDropped(alarm(1000, 960), 5)).toBe(false);
    expect(priceDropped(alarm(1000, 1100), 5)).toBe(false);
    expect(priceDropped(alarm(0, 10), 5)).toBe(false);
    expect(dropPercent(alarm(899.9, 649.9))).toBe(28);
  });

  it("stok ve ürün yolu", () => {
    expect(backInStock({ alarmId: 1, memberTicimaxId: 1, productName: "x", productUrl: null, stock: 3 })).toBe(true);
    expect(backInStock({ alarmId: 1, memberTicimaxId: 1, productName: "x", productUrl: null, stock: 0 })).toBe(false);
    expect(productPath("https://magaza.com/keten-gomlek?renk=mavi")).toBe("keten-gomlek?renk=mavi");
    expect(productPath("/urun/abc")).toBe("urun/abc");
    expect(productPath(null)).toBeNull();
  });
});

describe("doğum günü", () => {
  it("İstanbul saatine göre bugünü bulur", () => {
    expect(localDateParts(new Date("2026-09-24T22:30:00Z"), "Europe/Istanbul")).toEqual({ year: 2026, month: 9, day: 25, hour: 1 });
  });

  it("ay-gün eşleşmesi ve 29 Şubat kuralı", () => {
    expect(isBirthdayToday("1990-09-24", { year: 2026, month: 9, day: 24 })).toBe(true);
    expect(isBirthdayToday("1990-09-25", { year: 2026, month: 9, day: 24 })).toBe(false);
    expect(isBirthdayToday("1992-02-29", { year: 2026, month: 2, day: 28 })).toBe(true);
    expect(isBirthdayToday("1992-02-29", { year: 2028, month: 2, day: 28 })).toBe(false);
    expect(isBirthdayToday(null, { year: 2026, month: 9, day: 24 })).toBe(false);
  });

  it("kupon bitiş tarihi", () => {
    expect(formatDateTr(addDays({ year: 2026, month: 9, day: 28 }, 7))).toBe("05.10.2026");
  });
});

describe("chatbot", () => {
  const orders: BotOrder[] = [
    { id: 100245, statusName: "Kargoya verildi", orderedAt: new Date("2026-09-20T10:00:00Z"), total: 499.9, currency: "TL", carrierName: "Yurtiçi Kargo", trackingNo: "123456", trackingLink: "https://kargo.example/123456" },
    { id: 100100, statusName: "Teslim edildi", orderedAt: new Date("2026-08-02T10:00:00Z"), total: 250, currency: "TL", carrierName: null, trackingNo: null, trackingLink: null },
  ];
  const opts = { customerFirstName: "Ayşe", supportHoursText: "Hafta içi 09:00-18:00" };

  it.each([
    ["Siparişim nerede?", { kind: "order_status", orderId: null }],
    ["KARGOM GELMEDİ", { kind: "order_status", orderId: null }],
    ["100245 numaralı siparişim", { kind: "order_status", orderId: 100245 }],
    ["Temsilciyle görüşmek istiyorum", { kind: "human" }],
    ["Merhaba", { kind: "menu" }],
  ])("niyet: %s", (text, intent) => expect(detectIntent(text)).toEqual(intent));

  it("normalize", () => expect(normalize("  SİPARİŞİM  Nerede ")).toBe("siparisim nerede"));

  it("son siparişleri kargo bilgisiyle yanıtlar", () => {
    const reply = composeReply({ kind: "order_status", orderId: null }, orders, opts);
    expect(reply.needsHuman).toBe(false);
    expect(reply.text).toContain("Merhaba Ayşe!");
    expect(reply.text).toContain("*100245* numaralı sipariş");
    expect(reply.text).toContain("Kargo: Yurtiçi Kargo, takip no 123456");
    expect(reply.text).toContain("Takip linki: https://kargo.example/123456");
  });

  it("başkasının sipariş numarasında bilgi vermez", () => {
    const reply = composeReply({ kind: "order_status", orderId: 999999 }, orders, opts);
    expect(reply.text).toContain("eşleşen 999999 numaralı bir sipariş bulamadım");
    expect(reply.text).not.toContain("Kargoya verildi");
  });

  it("temsilci isteğini işaretler", () => {
    expect(composeReply({ kind: "human" }, orders, opts)).toMatchObject({ needsHuman: true });
  });

  it("siparişi olmayana yönlendirme yapar", () => {
    expect(composeReply({ kind: "order_status", orderId: null }, [], opts).text).toContain("kayıtlı bir sipariş bulamadım");
  });
});
