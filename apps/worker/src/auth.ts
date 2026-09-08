import { timingSafeEqual } from "node:crypto";

export function workerSecret() {
  return process.env.WORKER_API_SECRET || "dev-worker-secret-change-me";
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
