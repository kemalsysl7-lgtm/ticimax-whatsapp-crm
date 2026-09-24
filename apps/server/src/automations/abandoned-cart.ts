/**
 * Terk edilmiş sepet hatırlatma planı (saf fonksiyon).
 *
 * Bir sepet için k. hatırlatma, sepetin son güncellenmesinden `delaysHours[k]` saat sonra
 * zamanı gelir. Sunucu bir süre kapalı kaldıysa kaçırılan ara kademeler toplu gönderilmez;
 * yalnızca zamanı gelmiş en son kademe gönderilir. Sepet güncellenirse (tarih değişirse)
 * yeni bir hatırlatma dizisi başlar. Üye sepet tarihinden sonra sipariş verdiyse hatırlatma
 * gönderilmez.
 */
export interface CartSnapshot {
  cartId: number;
  memberTicimaxId: number;
  updatedAt: Date;
  itemCount: number;
  firstItemName: string | null;
  total: number;
}

export interface PlannedCartReminder {
  cart: CartSnapshot;
  step: number;
  dedupeKey: string;
}

/** Bu süreden eski sepetler için hatırlatma gönderilmez. */
export const MAX_CART_AGE_DAYS = 7;

export function planCartReminders(
  carts: readonly CartSnapshot[],
  lastOrderAtByMember: ReadonlyMap<number, Date>,
  delaysHours: readonly number[],
  now: Date,
): PlannedCartReminder[] {
  const delays = [...delaysHours].sort((a, b) => a - b);
  const plans: PlannedCartReminder[] = [];
  for (const cart of carts) {
    if (cart.itemCount <= 0) continue;
    const ageMs = now.getTime() - cart.updatedAt.getTime();
    if (ageMs > MAX_CART_AGE_DAYS * 86_400_000) continue;
    const lastOrder = lastOrderAtByMember.get(cart.memberTicimaxId);
    if (lastOrder && lastOrder >= cart.updatedAt) continue;

    let step = -1;
    delays.forEach((h, i) => {
      if (ageMs >= h * 3_600_000) step = i;
    });
    if (step < 0) continue;
    plans.push({
      cart,
      step,
      dedupeKey: `cart:${cart.cartId}:${cart.updatedAt.toISOString()}:step:${step}`,
    });
  }
  return plans;
}

/** "1.249,90 TL" biçimi. */
export function formatTl(amount: number): string {
  return `${new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)} TL`;
}
