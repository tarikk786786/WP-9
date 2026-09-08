import type { MessageAnalysis } from "../ai/analyze.ts";

const CANNED = /^dekh liya\.?\s*bolo[.!]*$/i;

const RECOVERY = [
  "maaf, pehle wala phas gaya. ab sun raha hoon — kya likhna hai",
  "stuck ho gaya tha. seedha bol, kya chahiye",
  "woh line dobara nahi. tu bol",
];

function compact(text: string): string {
  return text
    .toLowerCase()
    .replace(/[?.!,…]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isCannedFallback(text: string): boolean {
  return CANNED.test(text.trim());
}

export function isHoroscopeAsk(text: string): boolean {
  return /\b(horoscope|rashifal|rashi phal|zodiac|kundli|janam ?patri|star sign|today'?s luck|aaj ka rashi)\b/i.test(
    text,
  );
}

export function isWhatHappenedAsk(text: string): boolean {
  const n = compact(text);
  return /^(kya hua|kya hua tumhe|kya hua tujhe|kya hua aapko|kya problem|kya scene hai|kya hua tera)$/.test(n);
}

export function isBareCheckin(text: string): boolean {
  const n = compact(text);
  return /^(kya|kyu|kyun|bolo|bol|sun|kya baat|kya scene|kya baat hai)$/.test(n);
}

export function avoidRepeat(
  text: string,
  recent: Array<{ role: "user" | "assistant"; text: string }> = [],
): string {
  const outgoing = text.trim();
  if (!outgoing) return RECOVERY[0];
  const assistants = recent.filter((row) => row.role === "assistant").map((row) => row.text.trim());
  const last = assistants.at(-1);
  if (!last) return outgoing;
  const same = last.toLowerCase() === outgoing.toLowerCase();
  const cannedLoop = isCannedFallback(last) && (isCannedFallback(outgoing) || same);
  if (!same && !cannedLoop) return outgoing;
  const used = new Set(assistants.slice(-6).map((line) => line.toLowerCase()));
  return RECOVERY.find((line) => !used.has(line.toLowerCase())) ?? RECOVERY[0];
}

export function writeSpokenReply(
  text: string,
  analysis?: MessageAnalysis,
  recent: Array<{ role: "user" | "assistant"; text: string }> = [],
): string {
  const incoming = text.trim();
  const n = compact(incoming);
  let reply: string;

  if (isHoroscopeAsk(incoming)) {
    reply = "woh nahi dekhta. jo kaam hai, seedha likh";
  } else if (isWhatHappenedAsk(incoming)) {
    reply = "theek hoon. tu bol, kya scene hai";
  } else if (/^(bolo|bol)$/.test(n)) {
    reply = "haan, sun raha hoon. kya likhna hai";
  } else if (/^kya$/.test(n)) {
    reply = "haan, kya baat hai";
  } else if (/^(kya baat|kya scene|kya baat hai)$/.test(n)) {
    reply = "haan, bol";
  } else if (analysis?.intents[0] === "greeting" && analysis.complexity === "simple") {
    reply = "haan, kya haal hai";
  } else if (analysis?.intents[0] === "thanks") {
    reply = "koi baat nahi";
  } else if (
    /\?/.test(incoming) ||
    /^(kya|kaun|kab|kahan|kaise|kitna|kyu|kyun|why|what|where|when|how|who)\b/i.test(incoming)
  ) {
    reply = "ispe andaz nahi. jo kaam ya sawaal hai, seedha likh";
  } else {
    reply = "sun raha hoon. thoda clearly likh kya chahiye";
  }

  return avoidRepeat(reply, recent);
}
