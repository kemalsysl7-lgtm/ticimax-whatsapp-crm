import { Queue, Worker, type ConnectionOptions } from "bullmq";
import type { MessageQueue } from "../messaging/ports";

export const MESSAGE_QUEUE = "messages";
export const MAX_ATTEMPTS = 6;

export function redisConnection(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    tls: url.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

/**
 * Gönderim kuyruğu. Job id'leri her eklemede benzersizdir; aynı mesajın iki kez
 * gönderilmesini veritabanındaki `queued → sending` atomik geçişi engeller.
 */
export class BullMessageQueue implements MessageQueue {
  readonly queue: Queue;

  constructor(connection: ConnectionOptions) {
    this.queue = new Queue(MESSAGE_QUEUE, { connection });
  }

  async add(messageId: number, options?: { delayMs?: number }): Promise<void> {
    await this.queue.add(
      "send",
      { messageId },
      {
        jobId: `msg-${messageId}-${Date.now()}`,
        delay: options?.delayMs,
        attempts: MAX_ATTEMPTS,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    );
  }

  close(): Promise<void> {
    return this.queue.close();
  }
}

export function startMessageWorker(
  connection: ConnectionOptions,
  handle: (messageId: number) => Promise<unknown>,
  onExhausted: (messageId: number, error: Error) => Promise<void>,
): Worker {
  const worker = new Worker<{ messageId: number }>(MESSAGE_QUEUE, (job) => handle(job.data.messageId), {
    connection,
    concurrency: 5,
    // Meta'nın numara başı gönderim hızının oldukça altında kalır.
    limiter: { max: 20, duration: 1000 },
  });
  worker.on("failed", (job, err) => {
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      void onExhausted(job.data.messageId, err);
    }
  });
  return worker;
}
