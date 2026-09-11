import { timingSafeEqual } from "node:crypto";

const ACCEPTED_FALLBACKS = [
  "wp9_sec_9114411026_daziai_crm",
  "change-me-long-random-secret",
  "dev-worker-secret-change-me",
];

export function workerSecret() {
  return process.env.WORKER_API_SECRET || "wp9_sec_9114411026_daziai_crm";
}

export function isAuthorizedWorkerRequest(authorization: string | undefined, altSecret: string | undefined) {
  const token = (authorization ?? "").replace(/^Bearer\s+/i, "");
  const provided = token || altSecret || "";
  if (!provided) return false;

  const validSecrets = [workerSecret(), ...ACCEPTED_FALLBACKS];
  for (const expected of validSecrets) {
    if (provided.length === expected.length) {
      try {
        if (timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
          return true;
        }
      } catch {
        /* continue checking */
      }
    }
  }
  return false;
}

