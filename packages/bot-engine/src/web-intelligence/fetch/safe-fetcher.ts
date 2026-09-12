import { webCache } from "../cache/web-cache.ts";

export interface FetchResult {
  ok: boolean;
  url: string;
  statusCode?: number;
  content: string;
  contentType: string;
  title: string;
  error?: string;
  isCached?: boolean;
}

const PRIVATE_IP_PATTERNS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/,
  /^169\.254\.\d+\.\d+$/, // Link-local / Cloud Metadata (AWS/GCP/Azure)
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^fe80:/i,
];

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior)\s+instructions/gi,
  /disregard\s+(all\s+)?(previous|prior)\s+prompts/gi,
  /you\s+are\s+now\s+(an?\s+)?unfiltered/gi,
  /system\s+prompt\s*:/gi,
  /reveal\s+(the\s+)?(api\s+key|secret|password|token)/gi,
  /\badmin\s+override\b/gi,
  /\bjailbreak\b/gi,
];

export function isPrivateOrBlockedHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(host)) return true;
  }
  // Block cloud internal metadata hostnames
  if (
    host.includes("metadata.google.internal") ||
    host.includes("169.254.169.254") ||
    host.includes(".internal") ||
    host.includes(".local")
  ) {
    return true;
  }
  return false;
}

export function sanitizeWebContent(raw: string): string {
  let text = raw;
  // Neutralize known prompt injection attempts in web data
  for (const pattern of INJECTION_PATTERNS) {
    text = text.replace(pattern, "[UNTRUSTED_INSTRUCTION_FILTERED]");
  }
  return text;
}

export class SafeWebFetcher {
  private timeoutMs: number;
  private maxSizeBytes: number;

  constructor(options?: { timeoutMs?: number; maxSizeBytes?: number }) {
    this.timeoutMs = options?.timeoutMs ?? 5000;
    this.maxSizeBytes = options?.maxSizeBytes ?? 1024 * 1024; // 1 MB
  }

  public async fetchUrl(targetUrl: string, options?: { skipCache?: boolean }): Promise<FetchResult> {
    try {
      const parsed = new URL(targetUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return {
          ok: false,
          url: targetUrl,
          content: "",
          contentType: "",
          title: "",
          error: `Blocked unsafe protocol: ${parsed.protocol}`,
        };
      }

      if (isPrivateOrBlockedHost(parsed.hostname)) {
        return {
          ok: false,
          url: targetUrl,
          content: "",
          contentType: "",
          title: "",
          error: `Blocked private or local address (SSRF Defense): ${parsed.hostname}`,
        };
      }

      // Check cache first
      if (!options?.skipCache) {
        const cached = webCache.get(targetUrl);
        if (cached) {
          return {
            ok: true,
            url: targetUrl,
            statusCode: 200,
            content: cached.content,
            contentType: "text/html",
            title: cached.title,
            isCached: true,
          };
        }
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const res = await fetch(targetUrl, {
          signal: controller.signal,
          headers: {
            "User-Agent": "WP9-WebIntelligence/1.0 (+https://tarikislam.in)",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
          },
        });

        if (!res.ok) {
          return {
            ok: false,
            url: targetUrl,
            statusCode: res.status,
            content: "",
            contentType: res.headers.get("content-type") || "",
            title: "",
            error: `HTTP ${res.status}: ${res.statusText}`,
          };
        }

        const rawText = await res.text();
        const truncated = rawText.slice(0, this.maxSizeBytes);
        const sanitized = sanitizeWebContent(truncated);

        // Extract basic title if HTML
        const titleMatch = sanitized.match(/<title[^>]*>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : parsed.hostname;

        // Cache the successful fetch
        webCache.set({
          url: targetUrl,
          content: sanitized,
          title,
        });

        return {
          ok: true,
          url: targetUrl,
          statusCode: res.status,
          content: sanitized,
          contentType: res.headers.get("content-type") || "text/html",
          title,
          isCached: false,
        };
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        url: targetUrl,
        content: "",
        contentType: "",
        title: "",
        error: message.includes("abort") ? "Request timed out after 5s" : message,
      };
    }
  }
}

export const safeWebFetcher = new SafeWebFetcher();
