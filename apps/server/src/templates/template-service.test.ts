import { describe, expect, it, vi } from "vitest";
import type { StoredTemplate, TemplateStatus } from "../messaging/ports";
import type { TemplateDefinition } from "./template";
import { TemplateService, TemplateStateError, TemplateValidationError, mapMetaTemplateStatus, type TemplateRepository } from "./template-service";

const def: TemplateDefinition = {
  name: "kargoya_verildi_v1",
  language: "tr",
  category: "UTILITY",
  trigger: "order_status",
  body: "Merhaba {{ad}}, {{siparis_no}} numaralı siparişin yola çıktı.",
  buttons: [],
};

class FakeRepo implements TemplateRepository {
  rows = new Map<number, StoredTemplate & { metaTemplateId?: string; rejectionReason?: string | null }>();
  async getById(id: number) {
    return this.rows.get(id) ?? null;
  }
  async getByName(name: string) {
    return [...this.rows.values()].find((r) => r.name === name) ?? null;
  }
  async create(d: TemplateDefinition) {
    const row = { ...d, id: this.rows.size + 1, status: "draft" as TemplateStatus };
    this.rows.set(row.id, row);
    return row;
  }
  async update(id: number, d: TemplateDefinition) {
    const row = { ...this.rows.get(id)!, ...d };
    this.rows.set(id, row);
    return row;
  }
  async setStatus(where: { id: number } | { metaTemplateId: string }, status: TemplateStatus, extra = {}) {
    for (const row of this.rows.values()) {
      if (("id" in where && row.id === where.id) || ("metaTemplateId" in where && row.metaTemplateId === where.metaTemplateId)) {
        Object.assign(row, { status, ...extra });
      }
    }
  }
}

describe("TemplateService", () => {
  it("geçersiz şablonu kaydetmez", async () => {
    const service = new TemplateService(new FakeRepo(), { createTemplate: vi.fn() });
    await expect(service.create({ ...def, body: "{{ad}}" })).rejects.toBeInstanceOf(TemplateValidationError);
  });

  it("aynı adla ikinci şablonu reddeder ve yeni sürüm adı önerir", async () => {
    const service = new TemplateService(new FakeRepo(), { createTemplate: vi.fn() });
    await service.create(def);
    await expect(service.create(def)).rejects.toThrow("kargoya_verildi_v2");
  });

  it("taslağı Meta'ya gönderir, sonra webhook ile onaylanır", async () => {
    const repo = new FakeRepo();
    const createTemplate = vi.fn(async () => ({ id: "meta-1", status: "PENDING" }));
    const service = new TemplateService(repo, { createTemplate });
    const t = await service.create(def);

    await expect(service.submit(t.id)).resolves.toBe("pending");
    expect(createTemplate).toHaveBeenCalledWith(expect.objectContaining({ name: "kargoya_verildi_v1", category: "UTILITY" }));

    await service.applyMetaStatus("meta-1", "APPROVED", null);
    expect(repo.rows.get(t.id)?.status).toBe("approved");
  });

  it("onaya gönderilmiş şablonun düzenlenmesini ve tekrar gönderilmesini engeller", async () => {
    const repo = new FakeRepo();
    const service = new TemplateService(repo, { createTemplate: async () => ({ id: "m", status: "PENDING" }) });
    const t = await service.create(def);
    await service.submit(t.id);
    await expect(service.update(t.id, def)).rejects.toBeInstanceOf(TemplateStateError);
    await expect(service.submit(t.id)).rejects.toBeInstanceOf(TemplateStateError);
  });

  it("reddedilen şablon düzenlenip tekrar taslağa döner", async () => {
    const repo = new FakeRepo();
    const service = new TemplateService(repo, { createTemplate: async () => ({ id: "m", status: "PENDING" }) });
    const t = await service.create(def);
    await service.submit(t.id);
    await service.applyMetaStatus("m", "REJECTED", "INVALID_FORMAT");
    expect(repo.rows.get(t.id)).toMatchObject({ status: "rejected", rejectionReason: "INVALID_FORMAT" });
    await expect(service.update(t.id, { ...def, body: "Merhaba {{ad}}, siparişin {{siparis_no}} kargoda." })).resolves.toMatchObject({ status: "draft" });
  });

  it("Meta durumlarını eşler", () => {
    expect(mapMetaTemplateStatus("approved")).toBe("approved");
    expect(mapMetaTemplateStatus("IN_APPEAL")).toBe("pending");
    expect(mapMetaTemplateStatus("FLAGGED")).toBeNull();
  });
});
