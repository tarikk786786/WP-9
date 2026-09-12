import { normalizePhoneNumber } from "./phone-normalizer.ts";

export type JidType = "user_pn" | "user_lid" | "group" | "broadcast" | "unknown";

export interface ParsedJid {
  raw: string;
  type: JidType;
  phoneDigits?: string;
  lid?: string;
  groupId?: string;
  isDirectMessage: boolean;
}

export function parseJid(jid: string): ParsedJid {
  const clean = jid.trim();

  if (clean.endsWith("@g.us")) {
    return {
      raw: clean,
      type: "group",
      groupId: clean.replace(/@g\.us$/, ""),
      isDirectMessage: false,
    };
  }

  if (clean.endsWith("@broadcast")) {
    return {
      raw: clean,
      type: "broadcast",
      isDirectMessage: false,
    };
  }

  if (clean.endsWith("@lid")) {
    return {
      raw: clean,
      type: "user_lid",
      lid: clean.replace(/@lid$/, ""),
      isDirectMessage: true,
    };
  }

  if (clean.endsWith("@s.whatsapp.net")) {
    const rawNumber = clean.replace(/@s\.whatsapp\.net$/, "");
    return {
      raw: clean,
      type: "user_pn",
      phoneDigits: normalizePhoneNumber(rawNumber),
      isDirectMessage: true,
    };
  }

  // Bare number or unknown format
  const digits = normalizePhoneNumber(clean);
  if (digits) {
    return {
      raw: clean,
      type: "user_pn",
      phoneDigits: digits,
      isDirectMessage: true,
    };
  }

  return {
    raw: clean,
    type: "unknown",
    isDirectMessage: false,
  };
}
