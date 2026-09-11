import type {
  WorkerDetailedHealth,
  WorkerErrorCode,
  WorkerLiveness,
  WorkerReadiness,
} from "@bot/shared";
import { loadWorkerHeartbeat } from "@bot/database";

const DEFAULT_WORKER = process.env.WORKER_API_URL || "http://127.0.0.1:8788";
const SECRET = process.env.WORKER_API_SECRET || "dev-worker-secret-change-me";

let cachedWorkerUrl = DEFAULT_WORKER;
let lastWorkerUrlCheck = 0;

export async function resolveWorkerBase(): Promise<string> {
  const envUrl = process.env.WORKER_API_URL;
  if (envUrl && envUrl.trim().startsWith("http")) {
    cachedWorkerUrl = envUrl.trim();
    return cachedWorkerUrl.replace(/\/$/, "");
  }

  const now = Date.now();
  if (now - lastWorkerUrlCheck < 6000 && cachedWorkerUrl && cachedWorkerUrl !== "http://127.0.0.1:8788") {
    return cachedWorkerUrl.replace(/\/$/, "");
  }
  lastWorkerUrlCheck = now;
  try {
    const hb = await loadWorkerHeartbeat();
    if (hb?.tunnelUrl && typeof hb.tunnelUrl === "string" && hb.tunnelUrl.startsWith("http")) {
      cachedWorkerUrl = hb.tunnelUrl.trim();
      return cachedWorkerUrl.replace(/\/$/, "");
    }
  } catch {
    /* fallback to env */
  }
  cachedWorkerUrl = process.env.WORKER_API_URL || DEFAULT_WORKER;
  return cachedWorkerUrl.replace(/\/$/, "");
}

export function workerBase() {
  return cachedWorkerUrl.replace(/\/$/, "");
}

export function workerLooksLocal() {
  try {
    const host = new URL(workerBase()).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return true;
  }
}

export function classifyWorkerError(err: unknown, status?: number): WorkerErrorCode {
  if (status === 401 || status === 403) return "WORKER_AUTH_FAILED";
  if (status && status >= 500) return "WORKER_HTTP_ERROR";
  if (err instanceof DOMException && err.name === "TimeoutError") return "WORKER_TIMEOUT";
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("abort") || msg.includes("timeout")) return "WORKER_TIMEOUT";
    if (msg.includes("fetch failed") || msg.includes("econnrefused") || msg.includes("enotfound")) {
      return "WORKER_UNREACHABLE";
    }
  }
  return "WORKER_UNREACHABLE";
}

export async function workerFetch(path: string, init: RequestInit = {}) {
  const base = await resolveWorkerBase();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${SECRET}`);
  headers.set("x-worker-secret", SECRET);
  headers.set("x-request-id", requestId);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(`${base}${path}`, {
    ...init,
    headers,
    cache: "no-store",
    signal: init.signal ?? AbortSignal.timeout(10_000),
  });
}

export async function getWorkerLive(timeoutMs = 4000): Promise<{
  ok: boolean;
  data?: WorkerLiveness;
  error?: string;
  code?: WorkerErrorCode;
}> {
  try {
    const base = await resolveWorkerBase();
    const response = await fetch(`${base}/health/live`, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return {
        ok: false,
        error: `HTTP ${response.status}`,
        code: classifyWorkerError(null, response.status),
      };
    }
    const data = (await response.json()) as WorkerLiveness;
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Live check failed",
      code: classifyWorkerError(err),
    };
  }
}

export async function getWorkerReady(timeoutMs = 4000): Promise<{
  ok: boolean;
  data?: WorkerReadiness;
  error?: string;
  code?: WorkerErrorCode;
}> {
  try {
    const base = await resolveWorkerBase();
    const response = await fetch(`${base}/health/ready`, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = (await response.json()) as WorkerReadiness;
    return { ok: response.ok, data };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Readiness check failed",
      code: classifyWorkerError(err),
    };
  }
}

export async function getWorkerDetails(timeoutMs = 5000): Promise<{
  ok: boolean;
  data?: WorkerDetailedHealth;
  error?: string;
  code?: WorkerErrorCode;
}> {
  try {
    const base = await resolveWorkerBase();
    const response = await fetch(`${base}/health/details`, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return {
        ok: false,
        error: `HTTP ${response.status}`,
        code: classifyWorkerError(null, response.status),
      };
    }
    const data = (await response.json()) as WorkerDetailedHealth;
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Details check failed",
      code: classifyWorkerError(err),
    };
  }
}

export async function sendWorkerCommand<T = unknown>(
  path: string,
  body?: unknown,
  timeoutMs = 8000,
): Promise<{ ok: boolean; data?: T; error?: string; code?: WorkerErrorCode }> {
  try {
    const response = await workerFetch(path, {
      method: body ? "POST" : "GET",
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return {
        ok: false,
        error: `HTTP ${response.status}`,
        code: classifyWorkerError(null, response.status),
      };
    }
    const data = (await response.json()) as T;
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Worker command failed",
      code: classifyWorkerError(err),
    };
  }
}

export async function workerHealth() {
  const base = await resolveWorkerBase();
  const response = await fetch(`${base}/health`, {
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

