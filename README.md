# Ticimax WhatsApp CRM

Tek bir Ticimax mağazası için WhatsApp otomasyon ve CRM sistemi. Ticimax SOAP servislerinden
üye/sipariş verisini senkronlar, Meta WhatsApp Cloud API üzerinden onaylı şablonlarla mesaj gönderir,
izinleri (İYS uyumlu) kanıtlı şekilde tutar.

**Hedef özellikler:** "Siparişim nerede?" chatbotu ve kargo bildirimi, terk edilmiş sepet,
fiyat düştü / stoğa girdi, RFM segmentasyonu, doğum günü / yıldönümü, İYS izin senkronu.

## Mimari

```
Ticimax SOAP ──► Ticimax adapter ──┐                 ┌──► Meta Graph API (mesaj, şablon)
                                   ▼                 │
                       Senkron işleri ─► PostgreSQL ◄─┤
                                   │                 │
 Yönetim API'si / panel ─► Şablon motoru, izin politikası, gönderim kuyruğu (BullMQ + Redis)
                                                     ▲
                    Meta webhook (imzalı) ───────────┘  gelen mesaj, teslim durumu, şablon onayı
```

| Klasör (`apps/server/src`) | Sorumluluk |
|---|---|
| `ticimax/` | SOAP istemcisi + Ticimax verisini iç modele çeviren eşleyici |
| `whatsapp/` | Graph API istemcisi, webhook imza doğrulama, webhook ayrıştırıcı |
| `templates/` | Tetikleyici/değişken kataloğu, şablon doğrulama, önizleme, Meta gövdeleri, şablon yaşam döngüsü |
| `consent/` | İzin defteri, gönderim politikası (izin, sessiz saat, haftalık sınır), Ticimax izin eşitleme |
| `messaging/` | Gönderim kuyruğu çekirdeği, gelen mesaj ("DUR"/"BAŞLA") işleme |
| `sync/` | Ticimax → yerel kopya senkronu |
| `db/` | Drizzle şeması, migration, port implementasyonları |
| `app/` | NestJS: webhook, yönetim API'si, arka plan işleri |

Çekirdek iş mantığı (`templates/`, `consent/`, `messaging/`, `sync/`) framework'ten bağımsızdır ve
port arayüzleri üzerinden test edilir.

### Temel kurallar
- **Meta kuralları:** Müşteri son 24 saatte yazmadıysa yalnızca onaylı şablon gönderilir. Pazarlama
  şablonlarında çıkış yolu ("DUR" veya "Bildirimleri kapat" butonu) zorunludur.
- **İzin:** Bilgilendirme (UTILITY) mesajı `transactional`, pazarlama (MARKETING) mesajı `marketing`
  izni ister. İzin defteri yalnızca eklenir; geçerli durum en son kayıttır.
- **"DUR"** yazan müşterinin tüm izinleri kapanır. Ticimax'teki `SmsIzin` değeri gerçekten değişmedikçe
  senkron bu kararı geri almaz.
- **Pazarlama mesajları** sessiz saatlerde (varsayılan 21:00-09:00) ertelenir ve kişi başı haftalık
  sınıra (varsayılan 2) tabidir.
- **Tekrar gönderim yok:** Her iş olayı bir `dedupe_key` taşır. Kuyruktaki mesaj `queued → sending`
  atomik geçişiyle yalnızca bir işçi tarafından alınır.

## Yerel geliştirme

```bash
pnpm install
docker compose up -d                 # PostgreSQL + Redis
cp .env.example .env                 # değerleri doldurun
cd apps/server
pnpm build && pnpm db:migrate
pnpm db:seed-demo                    # isteğe bağlı: Ticimax olmadan denemek için ~240 örnek müşteri
pnpm dev
```

Testler: `pnpm -r test` · Tip kontrolü: `pnpm -r typecheck`

## Müşteri segmentasyonu (RFM)

Her müşteri; son alışverişten bu yana geçen süre (R), sipariş sayısı (F) ve toplam harcamaya (M) göre
1-5 puanlanır ve bir segmente atanır: Şampiyonlar (VIP), Sadık, Potansiyel sadık, Yeni, Tek seferlik,
Risk altında, **Uyuyan**, Kaybedilmiş, İlgi bekleyen, Hiç alışveriş yapmamış. İptal/iade edilmiş
siparişler sayılmaz. Kurallar ve eşikler: `apps/server/src/segments/rfm.ts`.

- Segmentler her senkron turunun sonunda ve panelden "Yeniden hesapla" ile güncellenir.
- İlk çalıştırmada sipariş geçmişi `ORDER_HISTORY_START` tarihinden (varsayılan 2018-01-01) itibaren
  90 günlük pencerelerle, birkaç senkron turuna yayılarak okunur.
- **Kampanya:** Bir segmente, "Segment kampanyası" tetikleyicili onaylı bir şablonla toplu mesaj gönderilir.
  Müşteri adı ve segment adı otomatik doldurulur; izin, sessiz saat ve haftalık sınır her mesajda uygulanır.
  Aynı kampanya bir müşteriye iki kez gitmez.

Şema değişikliğinde: `src/db/schema.ts` düzenlenir, `pnpm db:generate` ile yeni migration üretilir.

## Kurulum: Meta WhatsApp Cloud API

1. [Meta for Developers](https://developers.facebook.com/) üzerinde bir **Business** uygulaması
   oluşturun ve WhatsApp ürününü ekleyin; onaylı numaranızı WhatsApp Business hesabına (WABA) bağlayın.
2. İş Yöneticisi'nde (Business Manager) bir **System User** oluşturup `whatsapp_business_messaging`
   ve `whatsapp_business_management` izinleriyle **kalıcı erişim token'ı** üretin → `WHATSAPP_ACCESS_TOKEN`.
3. `WHATSAPP_PHONE_NUMBER_ID` ve `WHATSAPP_BUSINESS_ACCOUNT_ID` değerlerini WhatsApp > API Setup
   ekranından alın. Uygulama ayarlarındaki **App Secret** → `WHATSAPP_APP_SECRET`.
4. Rastgele, uzun bir `WHATSAPP_WEBHOOK_VERIFY_TOKEN` belirleyin.
5. WhatsApp > Configuration'da webhook adresini `https://<alan-adınız>/webhooks/whatsapp`, doğrulama
   token'ını 4. adımdaki değer olarak girin. **`messages`** ve **`message_template_status_update`**
   alanlarına abone olun.

## Kurulum: Ticimax

- `TICIMAX_BASE_URL`: mağaza adresiniz (ör. `https://www.magazaniz.com`). Servisler
  `/Servis/UyeServis.svc` gibi adreslerden okunur.
- `TICIMAX_UYE_KODU`: Ticimax'in verdiği web servis yetki kodu.

## Production dağıtımı (tek VPS)

```bash
cp .env.example deploy/.env    # production değerleri (DOMAIN, POSTGRES_PASSWORD, PANEL_* dahil)
docker compose --env-file deploy/.env -f deploy/docker-compose.prod.yml up -d --build
```

Caddy, alan adı için HTTPS sertifikasını otomatik alır. Sunucu her açılışta bekleyen migration'ları uygular.
Dışarıya yalnızca panel (`/`), Meta webhook'u (`/webhooks/*`) ve `/health` açılır. Yönetim API'si (`/admin/*`)
dışarıdan erişilemez; panel ona iç Docker ağından bağlanır.

## Yönetim paneli (`apps/panel`)

Next.js arayüzü. Sayfalar:
- **Segmentler:** RFM özet paneli (müşteri sayısı, ciro, VIP ciro payı, geri kazanılması gereken müşteri
  sayısı), segment kartları, müşteri listesine ve kampanyaya geçiş.
- **Müşteriler:** arama (ad, e-posta, telefon), segment filtresi, harcama/son alışveriş/izin durumu;
  müşteri detayında RFM puanı, izin geçmişi (kanıtıyla), gönderilen mesajlar ve siparişler.
- **Siparişler:** arama (sipariş no, müşteri, takip no) ve durum filtresi.
- **Kampanyalar:** segment + şablon seçimi, tahmini erişim, WhatsApp önizlemesi, onaylı gönderim;
  kampanya bazında gönderilen/iletilen/okunan/atlanan sayıları.
- **Şablonlar:** editör (değişken çipleri, butonlar, Meta kurallarıyla anlık doğrulama, önizleme,
  Meta onayına gönderme), onaylı şablonla test mesajı.
- **Mesajlar** ve **İzinler** (elle izin kaydı).

- Tek yönetici şifresi (`PANEL_PASSWORD`). Başarılı girişte `PANEL_SESSION_SECRET` ile imzalı, 12 saat
  geçerli, HttpOnly + SameSite=Strict bir çerez verilir. Aynı IP'den 15 dakikada 10 hatalı deneme sonrası
  giriş geçici olarak engellenir.
- `ADMIN_API_TOKEN` yalnızca panel sunucusunda kullanılır, tarayıcıya hiç gönderilmez.
- Yerelde: `cd apps/panel && pnpm dev` (http://localhost:3001; kök `.env` değerlerini ortama verin).

## Yönetim API'si

Tüm `/admin/*` uç noktaları `Authorization: Bearer <ADMIN_API_TOKEN>` ister ve yalnızca panel tarafından kullanılır.

| Uç nokta | Açıklama |
|---|---|
| `GET /admin/triggers` | Tetikleyiciler ve kullanılabilir değişkenler |
| `GET /admin/templates` | Şablon listesi (onay durumu, ret nedeni) |
| `POST /admin/templates/preview` | Kaydetmeden doğrulama + WhatsApp önizlemesi |
| `POST /admin/templates` | Şablon oluştur (taslak) |
| `PUT /admin/templates/:id` | Taslak/reddedilmiş şablonu düzenle |
| `POST /admin/templates/:id/submit` | Meta onayına gönder |
| `POST /admin/messages/test` | Onaylı şablonla bir numaraya test mesajı |
| `GET /admin/messages` | Son 100 mesaj ve durumları |
| `POST /admin/consents` | Elle izin kaydı |

## Yol haritası

| Faz | Kapsam | Durum |
|---|---|---|
| 1 – Temel | Ticimax adapter + üye/sipariş senkronu, WhatsApp adapter + imzalı webhook, izin defteri, şablon motoru + API, gönderim kuyruğu ve log + yönetim paneli | ✅ |
| 2 – Hızlı kazanımlar | Kargo bildirimi, "Siparişim nerede?" chatbotu, terk edilmiş sepet | ⏳ |
| 3 – Bildirimler | Fiyat/stok alarmı, doğum günü ve yıldönümü | ⏳ |
| 4 – Segmentasyon | Müşteri ve sipariş sayfaları, sipariş geçmişi doldurma, RFM segmentleri, segment kampanyaları | ✅ |
| 5 – Uyumluluk | İYS entegrasyonu, raporlama | ⏳ |

## Gerçek sistemlerle henüz doğrulanmamış noktalar
- **Ticimax WSDL parametre adları:** Dokümanda yok. İstemci bunları WSDL'den okuyup konumsal eşliyor;
  ilk gerçek bağlantıda `SelectUyeler` ve `SelectSiparis` çağrıları kontrol edilmeli.
- **Meta isimli parametre biçimi:** `parameter_format: "named"` ilk şablon gönderiminde teyit edilmeli
  (`templates/template.ts` → `META_PARAMETER_FORMAT`).
- **İzin varsayımı:** Ticimax'te `SmsIzin=true` hem pazarlama hem bilgilendirme izni sayılıyor
  (`consent/ticimax-consent.ts`). Hukuki değerlendirmeye göre değiştirilebilir.
