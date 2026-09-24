import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import type { Worker } from "bullmq";
import { processQueuedMessage } from "../messaging/send";
import { syncMembers, syncOrders } from "../sync/sync";
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
      const o = await syncOrders(this.c.syncDeps);
      this.logger.log(
        `Senkron: ${m.members} üye, ${m.consentChanges} izin değişikliği, ${o.orders} sipariş, ${o.statusChanges.length} durum değişikliği`,
      );
      // Faz 2: o.statusChanges → sipariş/kargo bildirimi kuyruğa alınacak.
    } catch (err) {
      this.logger.error(`Senkron başarısız: ${(err as Error).message}`);
    } finally {
      this.syncing = false;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.worker?.close();
    await this.c.queue.close();
    await this.c.sql.end({ timeout: 5 });
  }
}
