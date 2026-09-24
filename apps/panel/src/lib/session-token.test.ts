import { describe, expect, it } from "vitest";
import { LoginRateLimiter, SESSION_TTL_MS, createSessionToken, passwordMatches, verifySessionToken } from "./session-token";

const secret = "s".repeat(40);

describe("oturum token'ı", () => {
  it("kendi imzaladığı token'ı kabul eder", () => {
    expect(verifySessionToken(createSessionToken(secret), secret)).toBe(true);
  });

  it("süresi dolmuş token'ı reddeder", () => {
    const token = createSessionToken(secret, 0);
    expect(verifySessionToken(token, secret, SESSION_TTL_MS + 1)).toBe(false);
  });

  it("farklı secret veya oynanmış süreyi reddeder", () => {
    const token = createSessionToken(secret);
    expect(verifySessionToken(token, "x".repeat(40))).toBe(false);
    const [, sig] = token.split(".");
    expect(verifySessionToken(`${Date.now() + 10 * SESSION_TTL_MS}.${sig}`, secret)).toBe(false);
  });

  it("bozuk değerleri reddeder", () => {
    for (const bad of [undefined, "", "abc", "123", "123.", ".sig", "12a.sig"]) {
      expect(verifySessionToken(bad, secret)).toBe(false);
    }
  });
});

describe("passwordMatches", () => {
  it("yalnızca aynı şifreyi kabul eder", () => {
    expect(passwordMatches("dogru-sifre-123", "dogru-sifre-123")).toBe(true);
    expect(passwordMatches("dogru-sifre-12", "dogru-sifre-123")).toBe(false);
  });
});

describe("LoginRateLimiter", () => {
  it("pencere içinde sınırı aşınca engeller, pencere bitince açar", () => {
    const limiter = new LoginRateLimiter(3, 1000);
    for (let i = 0; i < 3; i++) limiter.recordFailure("ip", 0);
    expect(limiter.isBlocked("ip", 500)).toBe(true);
    expect(limiter.isBlocked("ip", 1001)).toBe(false);
    expect(limiter.isBlocked("baska-ip", 500)).toBe(false);
  });
});
