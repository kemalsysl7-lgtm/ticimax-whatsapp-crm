import type { Env } from "../config/env";
import { createDb } from "../db/client";
import {
  DrizzleConsentStore,
  DrizzleInboundStore,
  DrizzleMessageStore,
  DrizzleMirrorStore,
  DrizzleTemplateStore,
} from "../db/stores";
import type { InboundDeps } from "../messaging/inbound";
import type { SendDeps } from "../messaging/send";
import type { SyncDeps } from "../sync/sync";
import { TemplateService } from "../templates/template-service";
import { TicimaxClient } from "../ticimax/client";
import { GraphClient } from "../whatsapp/graph-client";
import { BullMessageQueue, redisConnection } from "./queue";

/**
 * Uygulamanın tüm bağımlılıklarını tek yerde kurar. NestJS'e tek bir değer olarak
 * verilir; çekirdek iş mantığı (messaging/, sync/, templates/) Nest'ten habersiz kalır.
 */
export function createContainer(env: Env) {
  const { db, sql } = createDb(env.DATABASE_URL);
  const connection = redisConnection(env.REDIS_URL);
  const clock = { now: () => new Date() };

  const messages = new DrizzleMessageStore(db);
  const templates = new DrizzleTemplateStore(db);
  const consents = new DrizzleConsentStore(db);
  const inbound = new DrizzleInboundStore(db);
  const mirror = new DrizzleMirrorStore(db);
  const queue = new BullMessageQueue(connection);

  const graph = new GraphClient({
    apiVersion: env.WHATSAPP_GRAPH_API_VERSION,
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
    businessAccountId: env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    accessToken: env.WHATSAPP_ACCESS_TOKEN,
  });
  const ticimax = new TicimaxClient({ baseUrl: env.TICIMAX_BASE_URL, uyeKodu: env.TICIMAX_UYE_KODU });

  const sendDeps: SendDeps = {
    messages,
    templates,
    consents,
    whatsapp: graph,
    queue,
    clock,
    policy: {
      timezone: env.TIMEZONE,
      quietHoursStart: env.QUIET_HOURS_START,
      quietHoursEnd: env.QUIET_HOURS_END,
      marketingWeeklyCap: env.MARKETING_WEEKLY_CAP,
    },
  };

  const inboundDeps: InboundDeps = {
    inbound,
    consents,
    whatsapp: graph,
    clock,
    findMemberIdByPhone: (phone) => mirror.findMemberIdByPhone(phone),
  };

  const syncDeps: SyncDeps = { source: ticimax, mirror, consents, clock };

  return {
    env,
    db,
    sql,
    connection,
    clock,
    stores: { messages, templates, consents, inbound, mirror },
    queue,
    graph,
    ticimax,
    templateService: new TemplateService(templates, graph),
    sendDeps,
    inboundDeps,
    syncDeps,
  };
}

export type Container = ReturnType<typeof createContainer>;
export const CONTAINER = Symbol("CONTAINER");
