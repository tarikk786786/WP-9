import { browserDomainPolicy } from "./domain-policy.ts";
import { browserCredentialPolicy } from "./credential-policy.ts";

export type BrowserActionType = "navigate" | "extract_text" | "screenshot" | "click" | "evaluate";

export interface BrowserActionRequest {
  action: BrowserActionType;
  targetUrl: string;
  selector?: string;
  timeoutMs?: number;
  userId: string;
}

export interface BrowserActionResult {
  success: boolean;
  action: BrowserActionType;
  url: string;
  data?: unknown;
  error?: string;
  durationMs: number;
}

export class BrowserSessionManager {
  public async executeAction(req: BrowserActionRequest): Promise<BrowserActionResult> {
    const start = Date.now();

    // 1. Check domain policy
    const domainCheck = browserDomainPolicy.isAllowed(req.targetUrl);
    if (!domainCheck.allowed) {
      return {
        success: false,
        action: req.action,
        url: req.targetUrl,
        error: `Action blocked by browser domain policy: ${domainCheck.reason}`,
        durationMs: Date.now() - start,
      };
    }

    const timeout = req.timeoutMs ?? 8000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      // For standard content extraction via browser simulation
      if (req.action === "navigate" || req.action === "extract_text") {
        const res = await fetch(req.targetUrl, {
          signal: controller.signal,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 WP9/1.0",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
        });

        if (!res.ok) {
          return {
            success: false,
            action: req.action,
            url: req.targetUrl,
            error: `HTTP ${res.status}: ${res.statusText}`,
            durationMs: Date.now() - start,
          };
        }

        const raw = await res.text();
        const safeText = browserCredentialPolicy.redactSensitiveData(raw.slice(0, 15000));

        return {
          success: true,
          action: req.action,
          url: req.targetUrl,
          data: {
            length: safeText.length,
            preview: safeText.slice(0, 500),
          },
          durationMs: Date.now() - start,
        };
      }

      return {
        success: true,
        action: req.action,
        url: req.targetUrl,
        data: { status: "simulated_action_success" },
        durationMs: Date.now() - start,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        action: req.action,
        url: req.targetUrl,
        error: msg.includes("abort") ? "Browser action timed out" : msg,
        durationMs: Date.now() - start,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export const browserSessionManager = new BrowserSessionManager();
