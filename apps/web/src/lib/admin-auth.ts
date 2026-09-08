import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "admin_session";

function secret() {
  return process.env.ADMIN_SECRET || "dev-admin-secret-change-me";
}

export function adminCookieName() {
  return COOKIE;
}

export function adminSessionToken() {
  return createHmac("sha256", secret()).update("admin-session").digest("hex");
}

export function isValidAdminSecret(input: string) {
  const expected = secret();
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function isValidAdminToken(token: string | undefined) {
  if (!token) return false;
  const expected = Buffer.from(adminSessionToken());
  const got = Buffer.from(token);
  if (expected.length !== got.length) return false;
  return timingSafeEqual(expected, got);
}
