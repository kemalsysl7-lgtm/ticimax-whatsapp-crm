import { sql } from "drizzle-orm";
import { createDb } from "./client";
import { consents, members, orders, templates } from "./schema";

/**
 * Ticimax bağlantısı olmadan paneli denemek için örnek veri üretir: ~240 üye, farklı alışveriş
 * alışkanlıkları (VIP, uyuyan, kaybedilmiş vb.), siparişler, izinler ve onaylı örnek şablonlar.
 * Yalnızca geliştirme içindir; production'da çalışmayı reddeder. Tekrar çalıştırılabilir.
 *
 * Kullanım: pnpm build && node --env-file=../../.env dist/db/seed-demo.js
 */
const FIRST = ["Ayşe", "Mehmet", "Zeynep", "Ahmet", "Elif", "Mustafa", "Fatma", "Emre", "Selin", "Burak", "Deniz", "Can", "Ece", "Kerem", "Merve", "Oğuz", "Seda", "Tolga", "Buse", "Hakan"];
const LAST = ["Yılmaz", "Kaya", "Demir", "Şahin", "Çelik", "Yıldız", "Aydın", "Öztürk", "Arslan", "Doğan", "Koç", "Kurt", "Özdemir", "Polat", "Erdoğan"];

/** Deterministik rastgele sayı üreticisi: her çalıştırmada aynı veri. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

type Profile = { share: number; orders: [number, number]; lastDays: [number, number]; spanDays: number; basket: [number, number] };
const PROFILES: Profile[] = [
  { share: 0.08, orders: [10, 18], lastDays: [1, 25], spanDays: 700, basket: [900, 2500] }, // şampiyon
  { share: 0.12, orders: [5, 9], lastDays: [10, 110], spanDays: 600, basket: [400, 1200] }, // sadık
  { share: 0.1, orders: [2, 3], lastDays: [3, 55], spanDays: 120, basket: [300, 900] }, // potansiyel sadık
  { share: 0.1, orders: [1, 1], lastDays: [2, 50], spanDays: 0, basket: [250, 800] }, // yeni
  { share: 0.12, orders: [1, 1], lastDays: [70, 230], spanDays: 0, basket: [200, 700] }, // tek seferlik / uyuyan
  { share: 0.1, orders: [4, 8], lastDays: [130, 235], spanDays: 700, basket: [400, 1100] }, // risk altında
  { share: 0.1, orders: [1, 2], lastDays: [125, 238], spanDays: 90, basket: [200, 600] }, // uyuyan
  { share: 0.13, orders: [1, 6], lastDays: [245, 900], spanDays: 500, basket: [200, 900] }, // kaybedilmiş
  { share: 0.15, orders: [0, 0], lastDays: [0, 0], spanDays: 0, basket: [0, 0] }, // hiç almamış
];

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Demo verisi production'da yüklenemez.");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL tanımlı değil");
  const { db, sql: conn } = createDb(url);
  const rand = rng(42);
  const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)]!;
  const between = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
  const now = Date.now();
  const day = 86_400_000;

  const memberRows: (typeof members.$inferInsert)[] = [];
  const orderRows: (typeof orders.$inferInsert)[] = [];
  const consentRows: (typeof consents.$inferInsert)[] = [];
  let memberId = 900_000;
  let orderId = 5_000_000;

  for (const profile of PROFILES) {
    const count = Math.round(240 * profile.share);
    for (let i = 0; i < count; i++) {
      const id = ++memberId;
      const firstName = pick(FIRST);
      const phone = rand() < 0.9 ? `905${between(30, 55)}${String(between(0, 9_999_999)).padStart(7, "0")}` : null;
      const sms = rand() < 0.75;
      memberRows.push({
        ticimaxId: id,
        firstName,
        lastName: pick(LAST),
        email: `demo${id}@ornek-magaza.test`,
        phone,
        birthDate: `19${between(70, 99)}-${String(between(1, 12)).padStart(2, "0")}-${String(between(1, 28)).padStart(2, "0")}`,
        smsPermission: sms,
        mailPermission: rand() < 0.6,
        memberTypeId: 1,
      });
      if (phone && sms) {
        const at = new Date(now - between(30, 400) * day);
        consentRows.push({ phone, memberTicimaxId: id, purpose: "marketing", granted: true, source: "ticimax_sms_izin", createdAt: at });
        consentRows.push({ phone, memberTicimaxId: id, purpose: "transactional", granted: true, source: "ticimax_sms_izin", createdAt: at });
        if (rand() < 0.06) {
          const stopAt = new Date(now - between(1, 25) * day);
          consentRows.push({ phone, memberTicimaxId: id, purpose: "marketing", granted: false, source: "whatsapp_stop", createdAt: stopAt });
          consentRows.push({ phone, memberTicimaxId: id, purpose: "transactional", granted: false, source: "whatsapp_stop", createdAt: stopAt });
        }
      }

      const n = between(profile.orders[0], profile.orders[1]);
      const last = between(profile.lastDays[0], profile.lastDays[1]);
      for (let k = 0; k < n; k++) {
        const daysAgo = k === 0 ? last : last + Math.floor(rand() * Math.max(profile.spanDays, 1));
        const status = k === 0 && last < 4 ? pick([2, 4, 6]) : rand() < 0.07 ? pick([8, 9]) : 7;
        orderRows.push({
          ticimaxId: ++orderId,
          memberTicimaxId: id,
          statusCode: status,
          statusName: { 2: "Onaylandı", 4: "Paketleniyor", 6: "Kargoya verildi", 7: "Teslim edildi", 8: "İptal edildi", 9: "İade edildi" }[status]!,
          customerName: `${firstName} ${memberRows.at(-1)!.lastName}`,
          deliveryPhone: phone,
          total: (between(profile.basket[0], profile.basket[1]) + 0.9).toFixed(2),
          currency: "TL",
          orderedAt: new Date(now - daysAgo * day - between(0, 80_000_000)),
          cargoCompanyId: 2,
          trackingNo: status >= 6 ? String(between(100_000_000, 999_999_999)) : null,
        });
      }
    }
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`delete from consents where member_ticimax_id >= 900000`);
    await tx.execute(sql`delete from orders where member_ticimax_id >= 900000`);
    await tx.execute(sql`delete from members where ticimax_id >= 900000`);
    for (let i = 0; i < memberRows.length; i += 500) await tx.insert(members).values(memberRows.slice(i, i + 500));
    for (let i = 0; i < orderRows.length; i += 500) await tx.insert(orders).values(orderRows.slice(i, i + 500));
    for (let i = 0; i < consentRows.length; i += 500) await tx.insert(consents).values(consentRows.slice(i, i + 500));

    const demoTemplates: (typeof templates.$inferInsert)[] = [
      {
        name: "kargoya_verildi_v1", category: "UTILITY", trigger: "order_status", status: "approved",
        body: "Merhaba {{ad}}, {{siparis_no}} numaralı siparişin {{kargo_firmasi}} ile yola çıktı. Takip no: {{takip_no}}",
        buttons: [{ type: "URL", text: "Kargom nerede?", url: "https://magazaniz.com/{{takip_yolu}}" }],
      },
      {
        name: "sizi_ozledik_v1", category: "MARKETING", trigger: "segment_campaign", status: "approved",
        headerText: "Sizi özledik!",
        body: "Merhaba {{ad}}, uzun zamandır görüşemedik. *{{kupon_kodu}}* koduyla bir sonraki siparişinde %15 indirim seni bekliyor.",
        footer: "Mesaj almak istemiyorsanız DUR yazın",
        buttons: [{ type: "URL", text: "Alışverişe başla", url: "https://magazaniz.com/{{kampanya_yolu}}" }, { type: "QUICK_REPLY", text: "Bildirimleri kapat" }],
      },
    ];
    for (const t of demoTemplates) await tx.insert(templates).values(t).onConflictDoNothing({ target: templates.name });
  });

  console.log(`Demo verisi yüklendi: ${memberRows.length} üye, ${orderRows.length} sipariş, ${consentRows.length} izin kaydı.`);
  console.log("Segmentleri görmek için sunucuyu başlatın (ilk senkron turunda hesaplanır) ya da panelde \"Yeniden hesapla\"ya basın.");
  await conn.end();
}

main().catch((err: unknown) => {
  console.error("Demo verisi yüklenemedi:", (err as Error).message);
  process.exit(1);
});
