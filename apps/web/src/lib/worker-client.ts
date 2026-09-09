const WORKER = process.env.WORKER_API_URL || "http://127.0.0.1:8788";
const SECRET = process.env.WORKER_API_SECRET || "dev-worker-secret-change-me";

export function workerBase() {
  return WORKER.replace(/\/$/, "");
}

export function workerLooksLocal() {
  try {
    const host = new URL(workerBase()).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return true;
  }
}

export async function workerFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${SECRET}`);
  headers.set("x-worker-secret", SECRET);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(`${workerBase()}${path}`, {
    ...init,
    headers,
    cache: "no-store",
    signal: init.signal ?? AbortSignal.timeout(10_000),
  });
}

export async function workerHealth() {
  const response = await fetch(`${workerBase()}/health`, {
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`worker health ${response.status}`);
  return response.json() as Promise<{
    whatsappConnection?: string;
    lastSuccessfulConnection?: string | null;
    whatsapp?: {
      phase?: string;
      connected?: boolean;
      phone?: string | null;
      persisted?: boolean;
      error?: string | null;
      lastConnectedAt?: string | null;
      qrDataUrl?: string | null;
      pairingCode?: string | null;
    };
  }>;
}
