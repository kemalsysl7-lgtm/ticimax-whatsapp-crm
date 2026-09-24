import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, ParseIntPipe, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { CampaignError, launchCampaign } from "../segments/campaign";
import { SEGMENT_KEYS, SEGMENTS, type SegmentKey } from "../segments/rfm";
import { AdminGuard } from "./admin.guard";
import { CONTAINER, type Container } from "./container";

const PAGE_SIZE = 50;

const segmentSchema = z.enum(SEGMENT_KEYS as [SegmentKey, ...SegmentKey[]]);

const listSchema = z.object({
  q: z.string().max(100).optional(),
  segment: segmentSchema.optional(),
  status: z.coerce.number().int().min(0).max(30).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

const campaignSchema = z.object({
  name: z.string().max(120).default(""),
  segment: segmentSchema,
  templateName: z.string().min(1),
  variables: z.record(z.string(), z.string().max(200)).default({}),
});

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new BadRequestException({ issues: result.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) });
  }
  return result.data;
}

/** Müşteriler, siparişler, segmentler ve kampanyalar (panel için). */
@Controller("admin")
@UseGuards(AdminGuard)
export class CrmController {
  constructor(@Inject(CONTAINER) private readonly c: Container) {}

  @Get("customers")
  async customers(@Query() query: unknown) {
    const p = parse(listSchema, query);
    const result = await this.c.adminQueries.listCustomers({ q: p.q, segment: p.segment, page: p.page, pageSize: PAGE_SIZE });
    return { ...result, page: p.page, pageSize: PAGE_SIZE };
  }

  @Get("customers/:id")
  async customer(@Param("id", ParseIntPipe) id: number) {
    const detail = await this.c.adminQueries.customerDetail(id);
    if (!detail) throw new NotFoundException("Müşteri bulunamadı");
    return detail;
  }

  @Get("orders")
  async orders(@Query() query: unknown) {
    const p = parse(listSchema, query);
    const result = await this.c.adminQueries.listOrders({ q: p.q, status: p.status, page: p.page, pageSize: PAGE_SIZE });
    return { ...result, page: p.page, pageSize: PAGE_SIZE };
  }

  @Get("segments")
  async segments() {
    const summary = await this.c.adminQueries.segmentSummary();
    const byKey = new Map(summary.map((s) => [s.segment, s]));
    return {
      computedAt: summary.find((s) => s.computedAt)?.computedAt ?? null,
      segments: SEGMENTS.map((def) => ({
        ...def,
        customers: byKey.get(def.key)?.customers ?? 0,
        withPhone: byKey.get(def.key)?.withPhone ?? 0,
        revenue: byKey.get(def.key)?.revenue ?? 0,
        avgOrders: byKey.get(def.key)?.avgOrders ?? 0,
      })),
    };
  }

  @Post("segments/recompute")
  recompute() {
    return this.c.recomputeSegments();
  }

  @Get("segments/:key/reach")
  reach(@Param("key") key: string) {
    return this.c.adminQueries.segmentReach(parse(segmentSchema, key));
  }

  @Get("campaigns")
  campaigns() {
    return this.c.adminQueries.listCampaigns();
  }

  @Post("campaigns")
  async launch(@Body() body: unknown) {
    const input = parse(campaignSchema, body);
    try {
      return await launchCampaign(this.c.campaignDeps, input);
    } catch (err) {
      if (err instanceof CampaignError) throw new BadRequestException(err.message);
      throw err;
    }
  }
}
