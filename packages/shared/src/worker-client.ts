import {
  WorkerErrorCode,
  WorkerLiveness,
  WorkerReadiness,
  WorkerDetailedHealth,
} from "./index";

export interface WorkerClientConfig {
  baseUrl?: string;
  secret?: string;
  defaultTimeoutMs?: number;
  maxRetries?: number;
}

export interface WorkerResponse<T = unknown> {
  ok: boolean;
  status?: number;
  data?: T;
  error?: string;
  code?: WorkerErrorCode;
  requestId?: string;
}

export class WorkerClient {
  private baseUrl: string;
  private secret: string;
  private defaultTimeoutMs: number;
  private maxRetries: number;

  constructor(config: WorkerClientConfig = {}) {
    this.baseUrl = (config.baseUrl || process.env.WORKER_API_URL || "http://127.0.0.1:8788").replace(/\/$/, "");
    this.secret = config.secret || process.env.WORKER_API_SECRET || "wp9_sec_9114411026_daziai_crm";
    this.defaultTimeoutMs = config.defaultTimeoutMs || 10_000;
    this.maxRetries = config.maxRetries || 3;
  }

  public setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/$/, "");
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public classifyError(err: unknown, status?: number): WorkerErrorCode {
    if (status === 401 || status === 403) return "WORKER_AUTH_FAILED";
    if (status === 503) return "WORKER_NOT_READY";
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

  public isRetryable(status?: number, err?: unknown): boolean {
    if (status === 400 || status === 401 || status === 403 || status === 404 || status === 422) {
      return false;
    }
    if (status === 502 || status === 503 || status === 504) {
      return true;
    }
    if (err) return true;
    return false;
  }

  public async fetchWithRetry(
    path: string,
    init: RequestInit = {},
    options?: { timeoutMs?: number; maxRetries?: number }
  ): Promise<Response> {
    const timeoutMs = options?.timeoutMs || this.defaultTimeoutMs;
    const maxRetries = options?.maxRetries !== undefined ? options.maxRetries : this.maxRetries;
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    const url = `${this.baseUrl}${cleanPath}`;
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.secret}`);
    headers.set("x-worker-secret", this.secret);
    headers.set("x-request-id", requestId);
    if (!headers.has("Content-Type") && init.method && init.method !== "GET") {
      headers.set("Content-Type", "application/json");
    }

    let lastError: unknown = null;
    let lastResponse: Response | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          ...init,
          headers,
          cache: "no-store",
          signal: init.signal ?? AbortSignal.timeout(timeoutMs),
        });

        if (response.ok || !this.isRetryable(response.status)) {
          return response;
        }

        lastResponse = response;
      } catch (err) {
        lastError = err;
        if (!this.isRetryable(undefined, err)) {
          throw err;
        }
      }

      if (attempt < maxRetries) {
        const delay = Math.min(400 * Math.pow(2, attempt) + Math.random() * 200, 4000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    if (lastResponse) return lastResponse;
    throw lastError || new Error(`Failed to fetch ${url} after ${maxRetries} retries`);
  }

  public async getLive(timeoutMs = 4000): Promise<WorkerResponse<WorkerLiveness>> {
    try {
      const response = await this.fetchWithRetry("/health/live", { method: "GET" }, { timeoutMs, maxRetries: 1 });
      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: `HTTP ${response.status}`,
          code: this.classifyError(null, response.status),
        };
      }
      const data = (await response.json()) as WorkerLiveness;
      return { ok: true, status: 200, data };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Live check failed",
        code: this.classifyError(err),
      };
    }
  }

  public async getReady(timeoutMs = 4000): Promise<WorkerResponse<WorkerReadiness>> {
    try {
      const response = await this.fetchWithRetry("/health/ready", { method: "GET" }, { timeoutMs, maxRetries: 1 });
      const data = (await response.json()) as WorkerReadiness;
      return {
        ok: response.ok,
        status: response.status,
        data,
        code: response.ok ? undefined : this.classifyError(null, response.status),
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Readiness check failed",
        code: this.classifyError(err),
      };
    }
  }

  public async getDetails(timeoutMs = 6000): Promise<WorkerResponse<WorkerDetailedHealth>> {
    try {
      const response = await this.fetchWithRetry("/health/details", { method: "GET" }, { timeoutMs, maxRetries: 2 });
      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: `HTTP ${response.status}`,
          code: this.classifyError(null, response.status),
        };
      }
      const data = (await response.json()) as WorkerDetailedHealth;
      return { ok: true, status: 200, data };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Details check failed",
        code: this.classifyError(err),
      };
    }
  }

  public async request<T = unknown>(
    path: string,
    method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
    body?: unknown,
    options?: { timeoutMs?: number; maxRetries?: number }
  ): Promise<WorkerResponse<T>> {
    try {
      const response = await this.fetchWithRetry(
        path,
        {
          method,
          body: body ? JSON.stringify(body) : undefined,
        },
        options
      );

      if (!response.ok) {
        let errorMsg = `HTTP ${response.status}`;
        try {
          const errJson = (await response.json()) as { error?: string };
          if (errJson.error) errorMsg = errJson.error;
        } catch {
          /* ignore */
        }
        return {
          ok: false,
          status: response.status,
          error: errorMsg,
          code: this.classifyError(null, response.status),
        };
      }

      const data = (await response.json()) as T;
      return { ok: true, status: response.status, data };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Request failed",
        code: this.classifyError(err),
      };
    }
  }
}

export const defaultWorkerClient = new WorkerClient();
