import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "admin_session";
export const DEFAULT_ADMIN_SECRET = "dev-admin-secret-change-me";

function acceptedSecrets() {
  const env = process.env.ADMIN_SECRET?.trim();
  if (env && process.env.VERCEL) return [env];
  return [...new Set([env, DEFAULT_ADMIN_SECRET].filter((value): value is string => Boolean(value)))];
}

function hashSecret(value: string) {
  return createHmac("sha256", "admin-compare").update(value).digest();
}

function sameHash(a: string, b: string) {
  return timingSafeEqual(hashSecret(a), hashSecret(b));
}

export function adminCookieName() {
  return COOKIE;
}

export function tokenForSecret(secret: string) {
  return createHmac("sha256", secret).update("admin-session").digest("hex");
}

export function adminSessionToken() {
  return tokenForSecret(acceptedSecrets()[0]);
}

export function isValidAdminSecret(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return false;
  return acceptedSecrets().some((secret) => sameHash(trimmed, secret));
}

export function isValidAdminToken(token: string | undefined) {
  if (!token) return false;
  return acceptedSecrets().some((secret) => {
    const expected = Buffer.from(tokenForSecret(secret));
    const got = Buffer.from(token);
    return expected.length === got.length && timingSafeEqual(expected, got);
  });
}
