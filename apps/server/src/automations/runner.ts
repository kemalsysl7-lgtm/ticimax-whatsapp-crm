import type { AutomationQueries } from "../db/automation-queries";
import type { MessageQueue, MessageStore, TemplateStore } from "../messaging/ports";
import { enqueueMessage } from "../messaging/send";
import type { MirrorStore } from "../sync/sync";
import type { Order, ProductAlarm } from "../ticimax/mapper";
import { formatTl, MAX_CART_AGE_DAYS, planCartReminders } from "./abandoned-cart";
import { backInStock, dropPercent, priceDropped, productPath } from "./alarms";
import { addDays, formatDateTr, localDateParts } from "./birthday";
import type { AutomationKey, AutomationState } from "./definitions";
import { firstName, planOrderNotifications } from "./order-status";
import { trackingPath } from "./tracking-link";

/**
 * Otomasyonların çalıştırıcısı: saf planlama fonksiyonlarını Ticimax, veritabanı ve gönderim
 * kuyruğuna bağlar. Her gönderim bir `dedupeKey` taşır; iş tekrar çalışsa da mesaj tekrarlanmaz.
 * Kapalı veya şablonu seçilmemiş otomasyon hiçbir şey göndermez.
 */
export interface AutomationSource {
  selectShipmentPackages(orderId: number): Promise<Array<{ carrierName: string | null; trackingNo: string | null; trackingLink: string | null }>>;
  selectCarts(p: { from: Date; to: Date }): Promise<import("../ticimax/mapper").Cart[]>;
  selectPriceAlarms(memberId: number): Promise<ProductAlarm[]>;
  selectStockAlarms(memberId: number): Promise<ProductAlarm[]>;
}

export interface RunnerDeps {
  queries: AutomationQueries;
  source: AutomationSource;
  mirror: Pick<MirrorStore, "getCursor" | "setCursor">;
  messages: MessageStore;
  templates: TemplateStore;
  queue: MessageQueue;
  clock: { now(): Date };
  timezone: string;
  trackingSecret: string;
  log(message: string): void;
}

export const ORDERS_INITIALIZED_KEY = "orders.initialized";

async function activeTemplate<K extends AutomationKey>(deps: RunnerDeps, key: K): Promise<AutomationState<K> | null> {
  const state = await deps.queries.getAutomation(key);
  return state.enabled && state.templateName ? state : null;
}

async function send(
  deps: RunnerDeps,
  input: { dedupeKey: string; phone: string; memberTicimaxId: number | null; templateName: string; variables: Record<string, string> },
): Promise<boolean> {
  const result = await enqueueMessage(deps, input);
  return result.created;
}

/** Sipariş durum değişikliklerinden bildirim üretir. İlk senkronda yalnızca "hazır" işareti koyar. */
export async function runOrderNotifications(
  deps: RunnerDeps,
  changes: ReadonlyArray<{ order: Order; previousStatus: number | null }>,
): Promise<number> {
  const initialized = (await deps.mirror.getCursor(ORDERS_INITIALIZED_KEY)) !== null;
  if (!initialized) {
    await deps.mirror.setCursor(ORDERS_INITIALIZED_KEY, deps.clock.now().toISOString());
    return 0;
  }
  let queued = 0;
  for (const plan of planOrderNotifications(changes, { initialized, now: deps.clock.now() })) {
    const state = await activeTemplate(deps, plan.automation);
    if (!state) continue;
    const { order } = plan;
    const member = order.memberTicimaxId ? await deps.queries.member(order.memberTicimaxId) : null;
    const phone = member?.phone ?? order.deliveryPhone;
    if (!phone) continue;

    let carrier: string | null = null;
    let trackingNo = order.trackingNo;
    if (plan.automation === "order_shipped") {
      try {
        const [pkg] = await deps.source.selectShipmentPackages(order.ticimaxId);
        if (pkg) {
          carrier = pkg.carrierName;
          trackingNo = pkg.trackingNo ?? trackingNo;
          await deps.queries.setOrderShipment(order.ticimaxId, pkg);
        }
      } catch (err) {
        deps.log(`Kargo paketi okunamadı (sipariş ${order.ticimaxId}): ${(err as Error).message}`);
      }
    }

    const created = await send(deps, {
      dedupeKey: plan.dedupeKey,
      phone,
      memberTicimaxId: order.memberTicimaxId,
      templateName: state.templateName!,
      variables: {
        ad: member?.firstName || firstName(order.customerName) || "Değerli müşterimiz",
        siparis_no: String(order.ticimaxId),
        durum: order.statusName,
        kargo_firmasi: carrier ?? "kargo firması",
        takip_no: trackingNo ?? "-",
        takip_yolu: trackingPath(order.ticimaxId, deps.trackingSecret),
      },
    });
    if (created) queued++;
  }
  return queued;
}

/** Sepetleri senkronlar ve zamanı gelen hatırlatmaları kuyruğa alır. */
export async function runAbandonedCarts(deps: RunnerDeps): Promise<{ carts: number; queued: number }> {
  const now = deps.clock.now();
  // Ticimax'e o an ulaşılamazsa hatırlatmalar durmaz; son senkronlanan sepetlerle devam edilir.
  let fetched: Awaited<ReturnType<AutomationSource["selectCarts"]>> = [];
  try {
    fetched = await deps.source.selectCarts({ from: new Date(now.getTime() - MAX_CART_AGE_DAYS * 86_400_000), to: now });
    await deps.queries.upsertCarts(fetched);
  } catch (err) {
    deps.log(`Sepetler Ticimax'ten okunamadı, son kopya kullanılıyor: ${(err as Error).message}`);
  }

  const state = await activeTemplate(deps, "abandoned_cart");
  if (!state) return { carts: fetched.length, queued: 0 };

  const carts = await deps.queries.recentMemberCarts(MAX_CART_AGE_DAYS);
  const byId = new Map(carts.map((c) => [c.cartId, c]));
  const lastOrders = new Map(carts.filter((c) => c.lastOrderAt).map((c) => [c.memberTicimaxId, c.lastOrderAt!]));
  const plans = planCartReminders(
    carts.map((c) => ({
      cartId: c.cartId,
      memberTicimaxId: c.memberTicimaxId,
      updatedAt: c.updatedAt,
      itemCount: c.items.reduce((a, i) => a + i.quantity, 0),
      firstItemName: c.items[0]?.name ?? null,
      total: c.total,
    })),
    lastOrders,
    state.settings.delaysHours,
    now,
  );

  let queued = 0;
  for (const plan of plans) {
    const cart = byId.get(plan.cart.cartId)!;
    const created = await send(deps, {
      dedupeKey: plan.dedupeKey,
      phone: cart.phone,
      memberTicimaxId: cart.memberTicimaxId,
      templateName: state.templateName!,
      variables: {
        ad: cart.firstName || "Değerli müşterimiz",
        urun_sayisi: String(plan.cart.itemCount),
        ilk_urun_adi: plan.cart.firstItemName ?? "ürün",
        sepet_toplami: formatTl(plan.cart.total),
        kupon_kodu: state.settings.couponCodes[plan.step] || "-",
        sepet_yolu: state.settings.cartPath,
      },
    });
    if (created) queued++;
  }
  return { carts: fetched.length, queued };
}

/** Fiyat ve stok alarmlarını, ayarlanan aralıkla (varsayılan 6 saat) kontrol eder. */
export async function runAlarms(deps: RunnerDeps): Promise<{ checkedMembers: number; queued: number } | null> {
  const price = await activeTemplate(deps, "price_drop");
  const stock = await activeTemplate(deps, "back_in_stock");
  if (!price && !stock) return null;

  const now = deps.clock.now();
  const everyHours = Math.min(price?.settings.checkEveryHours ?? Infinity, stock?.settings.checkEveryHours ?? Infinity);
  const last = await deps.mirror.getCursor("alarms.last_run");
  if (last && now.getTime() - new Date(last).getTime() < everyHours * 3_600_000) return null;
  await deps.mirror.setCursor("alarms.last_run", now.toISOString());

  const members = await deps.queries.marketingReachableMembers();
  let queued = 0;
  for (const m of members) {
    try {
      if (price) {
        for (const a of await deps.source.selectPriceAlarms(m.id)) {
          if (!priceDropped(a, price.settings.minDropPercent)) continue;
          const created = await send(deps, {
            dedupeKey: `price-alarm:${a.alarmId}`,
            phone: m.phone,
            memberTicimaxId: m.id,
            templateName: price.templateName!,
            variables: {
              ad: m.firstName || "Değerli müşterimiz",
              urun_adi: a.productName,
              eski_fiyat: formatTl(a.priceWhenAdded),
              yeni_fiyat: formatTl(a.currentPrice),
              indirim_yuzdesi: String(dropPercent(a)),
              urun_yolu: productPath(a.productUrl) ?? "",
            },
          });
          if (created) queued++;
        }
      }
      if (stock) {
        for (const a of await deps.source.selectStockAlarms(m.id)) {
          if (!backInStock(a)) continue;
          const created = await send(deps, {
            dedupeKey: `stock-alarm:${a.alarmId}`,
            phone: m.phone,
            memberTicimaxId: m.id,
            templateName: stock.templateName!,
            variables: { ad: m.firstName || "Değerli müşterimiz", urun_adi: a.productName, urun_yolu: productPath(a.productUrl) ?? "" },
          });
          if (created) queued++;
        }
      }
    } catch (err) {
      deps.log(`Alarm okunamadı (üye ${m.id}): ${(err as Error).message}`);
    }
  }
  return { checkedMembers: members.length, queued };
}

/** Günde bir kez, ayarlanan saatten sonra doğum günü mesajlarını kuyruğa alır. */
export async function runBirthdays(deps: RunnerDeps): Promise<number | null> {
  const state = await activeTemplate(deps, "birthday");
  if (!state) return null;
  const today = localDateParts(deps.clock.now(), deps.timezone);
  if (today.hour < state.settings.sendHour) return null;
  const todayKey = formatDateTr(today);
  if ((await deps.mirror.getCursor("birthday.last_date")) === todayKey) return null;

  const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const includeFeb29 = today.month === 2 && today.day === 28 && !isLeap(today.year);
  const members = await deps.queries.membersWithBirthday(today.month, today.day, includeFeb29);
  const validUntil = formatDateTr(addDays(today, state.settings.couponValidDays));
  let queued = 0;
  for (const m of members) {
    const created = await send(deps, {
      dedupeKey: `birthday:${m.id}:${today.year}`,
      phone: m.phone,
      memberTicimaxId: m.id,
      templateName: state.templateName!,
      variables: { ad: m.firstName || "Değerli müşterimiz", kupon_kodu: state.settings.couponCode || "-", kupon_bitis: validUntil },
    });
    if (created) queued++;
  }
  await deps.mirror.setCursor("birthday.last_date", todayKey);
  return queued;
}
