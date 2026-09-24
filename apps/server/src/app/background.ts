import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import type { Worker } from "bullmq";
import { runAbandonedCarts, runAlarms, runBirthdays, runOrderNotifications } from "../automations/runner";
import { processQueuedMessage } from "../messaging/send";
import { syncMembers, syncOrderHistory, syncOrders } from "../sync/sync";
import { CONTAINER, type Container } from "./container";
import { startMessageWorker } from "./queue";

/**
 * Arka plan işleri: gönderim kuyruğu işçisi + periyodik Ticimax senkronu.
 * `RUN_WORKERS=false` ile yalnızca HTTP sunan bir süreç çalıştırılabilir.
 */
@Injectable()
export class BackgroundJobs implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(BackgroundJobs.name);
  private worker: Worker | null = null;
  private timer: NodeJS.Timeout | null = null;
  private syncing = false;

  constructor(@Inject(CONTAINER) private readonly c: Container) {}

  onApplicationBootstrap(): void {
    if (!this.c.env.RUN_WORKERS) return;

    this.worker = startMessageWorker(
      this.c.connection,
      async (messageId) => {
        const result = await processQueuedMessage(this.c.sendDeps, messageId);
        if (result.outcome !== "noop") this.logger.log(`Mesaj #${messageId}: ${result.outcome}`);
      },
      async (messageId, error) => {
        await this.c.stores.messages.markFailed(messageId, null, `Yeniden deneme hakkı bitti: ${error.message}`);
      },
    );

    const intervalMs = this.c.env.SYNC_INTERVAL_MINUTES * 60_000;
    this.timer = setInterval(() => void this.runSync(), intervalMs);
    void this.runSync();
  }

  async runSync(): Promise<void> {
    if (this.syncing) return;
    this.syncing = true;
    try {
      const m = await syncMembers(this.c.syncDeps);
      const h = await syncOrderHistory(this.c.syncDeps, this.c.env.ORDER_HISTORY_START);
      const o = await syncOrders(this.c.syncDeps);
      const s = await this.c.recomputeSegments();
      this.logger.log(
        `Senkron: ${m.members} üye, ${m.consentChanges} izin değişikliği, ${o.orders} sipariş, ${o.statusChanges.length} durum değişikliği` +
          (h.windows ? `, geçmiş: ${h.orders} sipariş (${h.done ? "tamamlandı" : "devam ediyor"})` : "") +
          `, ${s.customers} müşteri segmentlendi`,
      );
      await this.step("Sipariş bildirimleri", async () => {
        const n = await runOrderNotifications(this.c.runnerDeps, o.statusChanges);
        return n ? `${n} mesaj kuyruğa alındı` : null;
      });
    } catch (err) {
      this.logger.error(`Senkron başarısız: ${(err as Error).message}`);
    }
    // Her otomasyon birbirinden bağımsız: biri hata verirse diğerleri yine çalışır.
    await this.step("Terk edilmiş sepet", async () => {
      const r = await runAbandonedCarts(this.c.runnerDeps);
      return r.queued ? `${r.carts} sepet, ${r.queued} hatırlatma kuyruğa alındı` : null;
    });
    await this.step("Fiyat/stok alarmları", async () => {
      const r = await runAlarms(this.c.runnerDeps);
      return r ? `${r.checkedMembers} üye kontrol edildi, ${r.queued} mesaj kuyruğa alındı` : null;
    });
    await this.step("Doğum günü", async () => {
      const n = await runBirthdays(this.c.runnerDeps);
      return n === null ? null : `${n} mesaj kuyruğa alındı`;
    });
    this.syncing = false;
  }

  private async step(name: string, fn: () => Promise<string | null>): Promise<void> {
    try {
      const result = await fn();
      if (result) this.logger.log(`${name}: ${result}`);
    } catch (err) {
      this.logger.error(`${name} başarısız: ${(err as Error).message}`);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.worker?.close();
    await this.c.queue.close();
    await this.c.sql.end({ timeout: 5 });
  }
}
