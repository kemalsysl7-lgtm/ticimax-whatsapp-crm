import type { StoredTemplate, TemplateStatus } from "../messaging/ports";
import { toMetaCreatePayload, validateTemplate, type TemplateDefinition, type ValidationIssue } from "./template";

/**
 * Şablon yaşam döngüsü: taslak → Meta onayına gönder → onaylandı/reddedildi.
 * Onaya gönderilmiş bir şablon düzenlenemez; değişiklik için yeni bir sürüm (yeni ad,
 * ör. fiyat_dustu_v2) oluşturulur. Meta, onaylı şablonların içeriğini değiştirmeye
 * sınırlı izin verir ve bu, yanlışlıkla gönderimde olan bir mesajı değiştirmeyi önler.
 */
export interface TemplateRepository {
  getById(id: number): Promise<StoredTemplate | null>;
  getByName(name: string): Promise<StoredTemplate | null>;
  create(def: TemplateDefinition): Promise<StoredTemplate>;
  update(id: number, def: TemplateDefinition): Promise<StoredTemplate | null>;
  setStatus(
    where: { id: number } | { metaTemplateId: string },
    status: TemplateStatus,
    extra?: { metaTemplateId?: string; rejectionReason?: string | null },
  ): Promise<void>;
}

export interface TemplateSubmitter {
  createTemplate(payload: Record<string, unknown>): Promise<{ id: string; status: string }>;
}

export class TemplateValidationError extends Error {
  constructor(readonly issues: ValidationIssue[]) {
    super("Şablon geçersiz");
  }
}

export class TemplateStateError extends Error {}

const EDITABLE: TemplateStatus[] = ["draft", "rejected"];

export function mapMetaTemplateStatus(metaStatus: string): TemplateStatus | null {
  switch (metaStatus.toUpperCase()) {
    case "APPROVED":
      return "approved";
    case "REJECTED":
      return "rejected";
    case "PENDING":
    case "IN_APPEAL":
      return "pending";
    case "PAUSED":
      return "paused";
    case "DISABLED":
      return "disabled";
    default:
      return null;
  }
}

export class TemplateService {
  constructor(
    private readonly repo: TemplateRepository,
    private readonly meta: TemplateSubmitter,
  ) {}

  async create(def: TemplateDefinition): Promise<StoredTemplate> {
    const issues = validateTemplate(def);
    if (issues.length) throw new TemplateValidationError(issues);
    await this.assertNameFree(def.name);
    return this.repo.create(def);
  }

  async update(id: number, def: TemplateDefinition): Promise<StoredTemplate> {
    const current = await this.repo.getById(id);
    if (!current) throw new TemplateStateError("Şablon bulunamadı");
    if (!EDITABLE.includes(current.status)) {
      throw new TemplateStateError("Onaya gönderilmiş şablon düzenlenemez; yeni bir sürüm oluşturun.");
    }
    const issues = validateTemplate(def);
    if (issues.length) throw new TemplateValidationError(issues);
    if (def.name !== current.name) await this.assertNameFree(def.name);
    const updated = await this.repo.update(id, def);
    await this.repo.setStatus({ id }, "draft", { rejectionReason: null });
    return { ...updated!, status: "draft" };
  }

  async submit(id: number): Promise<TemplateStatus> {
    const current = await this.repo.getById(id);
    if (!current) throw new TemplateStateError("Şablon bulunamadı");
    if (!EDITABLE.includes(current.status)) throw new TemplateStateError("Şablon zaten onaya gönderilmiş.");
    const issues = validateTemplate(current);
    if (issues.length) throw new TemplateValidationError(issues);

    const res = await this.meta.createTemplate(toMetaCreatePayload(current));
    const status = mapMetaTemplateStatus(res.status) ?? "pending";
    await this.repo.setStatus({ id }, status, { metaTemplateId: res.id, rejectionReason: null });
    return status;
  }

  private async assertNameFree(name: string): Promise<void> {
    if (await this.repo.getByName(name)) {
      throw new TemplateStateError(`"${name}" adıyla bir şablon zaten var; yeni sürüm için farklı bir ad kullanın (ör. ${name.replace(/_v\d+$/, "")}_v2).`);
    }
  }

  /** Meta'nın `message_template_status_update` webhook'u. */
  async applyMetaStatus(metaTemplateId: string, event: string, reason: string | null): Promise<void> {
    const status = mapMetaTemplateStatus(event);
    if (!status) return;
    await this.repo.setStatus({ metaTemplateId }, status, {
      rejectionReason: status === "rejected" ? (reason ?? "Belirtilmedi") : null,
    });
  }
}
