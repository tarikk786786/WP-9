import { timingSafeEqual } from "node:crypto";

export function workerSecret() {
  const secret = process.env.WORKER_API_SECRET;
  if (process.env.NODE_ENV === "production" && (!secret || secret === "dev-worker-secret-change-me")) {
    throw new Error("WORKER_API_SECRET is required in production and must not use dev default");
  }
  return secret || "dev-worker-secret-change-me";
}

export function isAuthorizedWorkerRequest(authorization: string | undefined, altSecret: string | undefined) {
  const expected = workerSecret();
  const token = (authorization ?? "").replace(/^Bearer\s+/i, "");
  const provided = token || altSecret || "";
  if (!provided || provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}
