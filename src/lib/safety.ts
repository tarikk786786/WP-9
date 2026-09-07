export type SafetyVerdict =
  | { action: "allow" }
  | { action: "skip"; reason: string }
  | { action: "safe-reply"; text: string; reason: string };

const OTP_HINT = /\b(otp|one[-\s]?time|verification code|2fa|auth code|login code)\b/i;
const MONEY_HINT =
  /\b(send( me)? (money|cash|bitcoin|usdt|crypto)|wire transfer|gift card|western union|account number|routing number)\b/i;
const JAILBREAK =
  /\b(ignore (all|any|previous) (instructions|rules)|you are now|system prompt|developer mode|dan mode)\b/i;
const SECRET_HINT = /\b(password|private key|seed phrase|recovery phrase|ssn|social security)\b/i;
const ABUSE = /\b(kill yourself|bomb making|how to hack(?:ing)? (?:into )?(?:their|someone))\b/i;

export function inspectIncoming(text: string): SafetyVerdict {
  const body = text.trim();
  if (body.length > 2000) {
    return { action: "skip", reason: "Message is too long to auto-reply safely." };
  }
  if (JAILBREAK.test(body)) {
    return {
      action: "safe-reply",
      text: "Bas normal chat karte hain, quietly. Bolo, kya help chahiye?",
      reason: "Blocked a prompt-injection attempt.",
    };
  }
  if (OTP_HINT.test(body) && /\d{4,8}/.test(body)) {
    return {
      action: "skip",
      reason: "Looks like a login or verification code — not auto-replied.",
    };
  }
  if (MONEY_HINT.test(body)) {
    return {
      action: "safe-reply",
      text: "Arre yeh payment ya transfer chat pe nahi hota. Agar asli baat hai to main khud, shaanti se follow up karunga.",
      reason: "Blocked a money-transfer request.",
    };
  }
  if (SECRET_HINT.test(body)) {
    return {
      action: "safe-reply",
      text: "Password ya recovery yahan mat bhejo please. Main alag se, narmi se baat karunga.",
      reason: "Blocked a secrets request.",
    };
  }
  if (ABUSE.test(body)) {
    return { action: "skip", reason: "Unsafe request — no auto-reply." };
  }
  return { action: "allow" };
}

export function sanitizeOutgoing(text: string): string {
  let clean = text.replace(/\s+/g, " ").trim();
  clean = clean.replace(/^(as an ai|as a language model|i am an ai)[, ]*/i, "");
  clean = clean.replace(/<\/?[a-z][^>]*>/gi, "");
  if (clean.length > 420) {
    clean = `${clean.slice(0, 417).trim()}…`;
  }
  return clean;
}

const windows = new Map<string, number[]>();

export function isRateLimited(fromId: string, now = Date.now()): boolean {
  const windowMs = 10 * 60 * 1000;
  const recent = (windows.get(fromId) ?? []).filter((stamp) => now - stamp < windowMs);
  if (recent.length >= 8) {
    windows.set(fromId, recent);
    return true;
  }
  recent.push(now);
  windows.set(fromId, recent);
  return false;
}
