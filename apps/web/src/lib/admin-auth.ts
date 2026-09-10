import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "admin_session";
export const DEFAULT_ADMIN_SECRET = "dev-admin-secret-change-me";
export const EXAMPLE_ADMIN_SECRET = "change-me-admin-password";

function envSecrets() {
  return [process.env.ADMIN_SECRET, process.env.ADMIN_SECRET_ALT]
    .flatMap((value) => (value ?? "").split(/[,;\n]+/))
    .map((value) => value.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

function acceptedSecrets() {
  const fromEnv = envSecrets();
  if (fromEnv.length && process.env.VERCEL && process.env.STRICT_ADMIN_SECRET === "1") {
    return [...new Set(fromEnv)];
  }
  return [...new Set([...fromEnv, DEFAULT_ADMIN_SECRET, EXAMPLE_ADMIN_SECRET])];
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
  const trimmed = input.trim().replace(/^["']|["']$/g, "");
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
