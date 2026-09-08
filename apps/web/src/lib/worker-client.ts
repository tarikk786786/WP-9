const WORKER = process.env.WORKER_API_URL || "http://127.0.0.1:8788";
const SECRET = process.env.WORKER_API_SECRET || "dev-worker-secret-change-me";

export function workerBase() {
  return WORKER.replace(/\/$/, "");
}

export async function workerFetch(path: string, init: RequestInit = {}) {
  return fetch(`${workerBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${SECRET}`,
      "x-worker-secret": SECRET,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
}
