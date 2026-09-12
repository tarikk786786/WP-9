export class BrowserCredentialPolicy {
  public redactSensitiveData(text: string): string {
    return text
      .replace(/bearer\s+[A-Za-z0-9\-\._~\+\/]+=*/gi, "Bearer [REDACTED]")
      .replace(/(password|secret|api[_-]?key|token)\s*[:=]\s*['"]?[^\s'"]+/gi, "$1=[REDACTED]");
  }

  public canTransmitCredentials(targetUrl: string, origin: string): boolean {
    try {
      const targetHost = new URL(targetUrl).hostname;
      const originHost = new URL(origin).hostname;
      // Only allow sending credentials if domains match exactly
      return targetHost === originHost;
    } catch {
      return false;
    }
  }
}

export const browserCredentialPolicy = new BrowserCredentialPolicy();
