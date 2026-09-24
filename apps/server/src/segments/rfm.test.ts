import { describe, expect, it } from "vitest";
import { classify, frequencyScore, monetaryScorer, recencyScore, segmentCustomers, SEGMENTS, SEGMENT_KEYS } from "./rfm";

const now = new Date("2026-09-24T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

describe("puanlar", () => {
  it.each([[0, 5], [30, 5], [31, 4], [60, 4], [100, 3], [200, 2], [241, 1], [900, 1]])("recency %i gün → %i", (d, s) =>
    expect(recencyScore(d)).toBe(s));
  it.each([[1, 1], [2, 2], [3, 3], [4, 3], [5, 4], [9, 4], [10, 5], [40, 5]])("frequency %i sipariş → %i", (n, s) =>
    expect(frequencyScore(n)).toBe(s));

  it("harcamayı beşte birlik dilimlere göre puanlar", () => {
    const score = monetaryScorer([100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]);
    expect(score(100)).toBe(1);
    expect(score(350)).toBe(2);
    expect(score(1000)).toBe(5);
  });

  it("hiç alışveriş yoksa harcama puanı 1", () => expect(monetaryScorer([])(500)).toBe(1));
});

describe("classify", () => {
  it.each([
    [5, 5, 5, "champions"],
    [3, 4, 2, "loyal"],
    [5, 1, 3, "new"],
    [4, 2, 2, "potential_loyal"],
    [2, 3, 3, "at_risk"],
    [2, 1, 1, "sleeping"],
    [2, 2, 5, "sleeping"],
    [1, 5, 5, "lost"],
    [3, 1, 1, "one_time"],
    [3, 2, 3, "needs_attention"],
  ] as const)("R%i F%i M%i → %s", (r, f, m, segment) => expect(classify(r, f, m)).toBe(segment));

  it("her segmentin panel etiketi var", () => {
    expect(new Set(SEGMENT_KEYS).size).toBe(SEGMENTS.length);
  });
});

describe("segmentCustomers", () => {
  it("gerçekçi bir müşteri kümesini segmentlere ayırır", () => {
    const stats = [
      { memberTicimaxId: 1, orderCount: 12, totalSpent: 25_000, lastOrderAt: daysAgo(5) },
      { memberTicimaxId: 2, orderCount: 1, totalSpent: 300, lastOrderAt: daysAgo(10) },
      { memberTicimaxId: 3, orderCount: 6, totalSpent: 4_000, lastOrderAt: daysAgo(150) },
      { memberTicimaxId: 4, orderCount: 1, totalSpent: 250, lastOrderAt: daysAgo(180) },
      { memberTicimaxId: 5, orderCount: 2, totalSpent: 900, lastOrderAt: daysAgo(400) },
      { memberTicimaxId: 6, orderCount: 0, totalSpent: 0, lastOrderAt: null },
    ];
    const result = Object.fromEntries(segmentCustomers(stats, now).map((s) => [s.memberTicimaxId, s]));
    expect(result[1]).toMatchObject({ segment: "champions", recencyDays: 5, r: 5, f: 5, m: 5 });
    expect(result[2]?.segment).toBe("new");
    expect(result[3]?.segment).toBe("at_risk");
    expect(result[4]?.segment).toBe("sleeping");
    expect(result[5]?.segment).toBe("lost");
    expect(result[6]).toMatchObject({ segment: "no_orders", recencyDays: null });
  });
});
