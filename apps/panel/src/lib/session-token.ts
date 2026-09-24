import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Panel oturum token'ı: `<sonKullanmaUnixMs>.<HMAC-SHA256>`. Sunucu tarafında durum tutmaz;
 * imza PANEL_SESSION_SECRET ile doğrulanır. Tek yönetici kullanıcı olduğu için kullanıcı
 * kimliği taşımaz.
 */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(`panel-session:${payload}`).digest("base64url");
}

export function createSessionToken(secret: string, now = Date.now()): string {
  const expires = String(now + SESSION_TTL_MS);
  return `${expires}.${sign(expires, secret)}`;
}

export function verifySessionToken(token: string | undefined, secret: string, now = Date.now()): boolean {
  if (!token) return false;
  const [expires, signature] = token.split(".");
  if (!expires || !signature || !/^\d+$/.test(expires)) return false;
  const expected = Buffer.from(sign(expires, secret));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  return Number(expires) > now;
}

/** Şifre karşılaştırması: uzunluk bilgisini sızdırmamak için önce özetlenir. */
export function passwordMatches(given: string, expected: string): boolean {
  const a = createHmac("sha256", "panel-password").update(given).digest();
  const b = createHmac("sha256", "panel-password").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Giriş denemesi sınırlayıcı (bellek içi; tek panel süreci için yeterli).
 * Aynı IP'den 15 dakikada en fazla 10 hatalı deneme.
 */
export class LoginRateLimiter {
  private readonly attempts = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly max = 10,
    private readonly windowMs = 15 * 60 * 1000,
  ) {}

  isBlocked(key: string, now = Date.now()): boolean {
    const entry = this.attempts.get(key);
    if (!entry || entry.resetAt <= now) return false;
    return entry.count >= this.max;
  }

  recordFailure(key: string, now = Date.now()): void {
    const entry = this.attempts.get(key);
    if (!entry || entry.resetAt <= now) this.attempts.set(key, { count: 1, resetAt: now + this.windowMs });
    else entry.count++;
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }
}
