import { isPrivateOrBlockedHost } from "../web-intelligence/fetch/safe-fetcher.ts";

export class BrowserDomainPolicy {
  private allowedDomains: Set<string> = new Set([
    "tarikislam.in",
    "github.com",
    "en.wikipedia.org",
    "news.ycombinator.com",
    "weather.com",
    "imd.gov.in",
  ]);

  private blockedDomains: Set<string> = new Set([
    "localhost",
    "127.0.0.1",
    "169.254.169.254",
  ]);

  public isAllowed(targetUrl: string): { allowed: boolean; reason?: string } {
    try {
      const parsed = new URL(targetUrl);

      // Check protocol
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return { allowed: false, reason: `Disallowed protocol: ${parsed.protocol}` };
      }

      // Check SSRF & private hosts
      if (isPrivateOrBlockedHost(parsed.hostname) || this.blockedDomains.has(parsed.hostname)) {
        return { allowed: false, reason: `Blocked private or restricted address: ${parsed.hostname}` };
      }

      // Allow public domain if not blocked
      return { allowed: true };
    } catch {
      return { allowed: false, reason: "Invalid target URL" };
    }
  }

  public addAllowedDomain(domain: string): void {
    this.allowedDomains.add(domain.toLowerCase().trim());
  }
}

export const browserDomainPolicy = new BrowserDomainPolicy();
