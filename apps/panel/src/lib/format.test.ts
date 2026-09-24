import { describe, expect, it } from "vitest";
import { daysAgo, formatPhone } from "./format";

describe("format", () => {
  it("telefonu okunur biçime çevirir", () => {
    expect(formatPhone("905321234567")).toBe("0532 123 45 67");
    expect(formatPhone(null)).toBe("—");
  });

  it("göreli süreyi yazar", () => {
    const now = Date.parse("2026-09-24T12:00:00Z");
    expect(daysAgo("2026-09-24T08:00:00Z", now)).toBe("bugün");
    expect(daysAgo("2026-09-20T12:00:00Z", now)).toBe("4 gün önce");
    expect(daysAgo("2026-05-01T12:00:00Z", now)).toBe("4 ay önce");
    expect(daysAgo("2024-09-01T12:00:00Z", now)).toBe("2 yıl önce");
    expect(daysAgo(null, now)).toBe("—");
  });
});
