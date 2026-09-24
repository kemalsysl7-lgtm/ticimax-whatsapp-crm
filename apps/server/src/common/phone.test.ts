import { describe, expect, it } from "vitest";
import { normalizeTrMobile } from "./phone";

describe("normalizeTrMobile", () => {
  it.each([
    ["0532 123 45 67", "905321234567"],
    ["5321234567", "905321234567"],
    ["+90 (532) 123-45-67", "905321234567"],
    ["905321234567", "905321234567"],
    ["0090 532 123 45 67", "905321234567"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeTrMobile(input)).toBe(expected);
  });

  it.each([null, undefined, "", "0212 123 45 67", "12345", "+44 7700 900123"])(
    "tanınmayan biçim için null döner: %s",
    (input) => {
      expect(normalizeTrMobile(input)).toBeNull();
    },
  );
});
