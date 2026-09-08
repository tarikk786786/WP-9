export type MessageMood = "neutral" | "warm" | "stressed" | "casual" | "frustrated";

export type MessageReading = {
  normalized: string;
  asks: string[];
  meaning: string;
  mood: MessageMood;
  implied: string[];
};

const TYPO_FIX: Array<[RegExp, string]> = [
  [/\b(hii+|heyy+|hlo|hlw)\b/gi, "hi"],
  [/\b(plz|pls|plse)\b/gi, "please"],
  [/\b(webiste|websit)\b/gi, "website"],
  [/\b(portfolo|portfilio)\b/gi, "portfolio"],
  [/\b(availble|avaliable)\b/gi, "available"],
  [/\b(pric|prce|prize)\b/gi, "price"],
  [/\b(budjet|budjett)\b/gi, "budget"],
  [/\b(tommorow|tomorow)\b/gi, "tomorrow"],
];

const ASK_LABELS: Array<{ pattern: RegExp; ask: string }> = [
  { pattern: /\b(price|pricing|rate|cost|kitna|daam|budget|quote|estimate)\b/i, ask: "rate kaise decide hota hai" },
  { pattern: /\b(process|kaise start|steps?|workflow|approach|kaise chalta)\b/i, ask: "kaam kaise chalta hai" },
  { pattern: /\b(portfolio|work samples?|case stud|previous work|examples?)\b/i, ask: "portfolio kahan dekhna hai" },
  { pattern: /\b(website|site|tarikislam|link|url)\b/i, ask: "site kahan hai" },
  { pattern: /\b(dezo|studio)\b/i, ask: "dezo kya hai" },
  { pattern: /\b(available|availability|hire|hiring|freelance|engage)\b/i, ask: "abhi time hai ya nahi" },
  { pattern: /\b(timeline|kitne din|how long|deadline|kab tak)\b/i, ask: "kitna time lagta hai" },
  { pattern: /\b(call|zoom|meet|meeting|milna|baat kar)\b/i, ask: "call/meet kab ho sakta hai" },
  { pattern: /\b(hours?|timing|kitne baje)\b/i, ask: "kab tak yahin rehta hoon" },
  { pattern: /\b(where|location|address|kahan|kidhar|based)\b/i, ask: "kahan se kaam karta hoon" },
  { pattern: /\b(who are you|kaun ho|your name|aap kaun|tum kaun)\b/i, ask: "main kaun hoon" },
  { pattern: /\b(what do you do|kya karte|kaam kya|services?)\b/i, ask: "main kya karta hoon" },
  { pattern: /\b(forensic|evidence|malware|incident)\b/i, ask: "forensics pe kaam hota hai kya" },
  { pattern: /\b(cyber|security|audit|pentest)\b/i, ask: "security pe kaam hota hai kya" },
  { pattern: /\b(project|banana hai|website chahiye|site chahiye|build|mvp)\b/i, ask: "kya banana soch rahe ho" },
];

export function normalizeHumanText(text: string): string {
  let out = text.replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
  for (const [pattern, fix] of TYPO_FIX) {
    out = typeof fix === "function" ? out.replace(pattern, fix) : out.replace(pattern, fix);
  }
  return out.replace(/\s+/g, " ").trim();
}

export function splitHumanAsks(text: string): string[] {
  const trimmed = normalizeHumanText(text);
  if (!trimmed) return [];

  const numbered = trimmed
    .split(/\n+|(?=\b\d+[.)]\s)/)
    .map((part) => part.replace(/^\d+[.)]\s*/, "").trim())
    .filter((part) => part.length > 8);
  if (numbered.length > 1) return uniqueAsks(numbered);

  const byQuestion = trimmed
    .split(/(?<=[?؟])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (byQuestion.length > 1) return uniqueAsks(byQuestion);

  const byJoin = trimmed
    .split(/\s*,\s*(?=(?:process|price|rate|site|portfolio|kab|kahan|kaise|kya|kitna|when|where|how|what)\b)|\s+(?:aur|and|also|plus)\s+/i)
    .map((part) => part.replace(/^[,.]+\s*/, "").trim())
    .filter((part) => part.length > 8);
  if (byJoin.length > 1) return uniqueAsks(byJoin);

  return [trimmed];
}

function uniqueAsks(asks: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ask of asks) {
    const key = ask.toLowerCase().replace(/[?.!]+$/g, "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(ask.replace(/^[,\s]+/, "").trim());
  }
  return out;
}

export function inferMood(text: string): MessageMood {
  const body = text.toLowerCase();
  if (/\b(urgent|jaldi|asap|emergency|stuck|tight|help|problem|issue)\b/.test(body)) return "stressed";
  if (/\b(galat|wrong|wtf|annoyed|late|nahi hua)\b/.test(body)) return "frustrated";
  if (/\b(thanks|thank|shukriya|love|great|nice)\b/.test(body)) return "warm";
  if (/\b(bro|bhai|yaar|dude|lol)\b/.test(body)) return "casual";
  return "neutral";
}

export function impliedAsks(text: string): string[] {
  let found = ASK_LABELS.filter((row) => row.pattern.test(text)).map((row) => row.ask);
  const wantsWork = /\b(chahiye|banana|hire|hiring|build|banwana)\b/i.test(text);
  const asksWhere = /\b(kahan|where|link|url|portfolio|dekhun)\b/i.test(text);
  if (wantsWork && !asksWhere) {
    found = found.filter((ask) => ask !== "site kahan hai" && ask !== "portfolio kahan dekhna hai");
  }
  return [...new Set(found)];
}

export function readMessage(text: string): MessageReading {
  const normalized = normalizeHumanText(text);
  const split = splitHumanAsks(normalized);
  const implied = impliedAsks(normalized);
  const asks = uniqueAsks([
    ...split.filter((part) => /[?]/.test(part) || implied.length <= 1 || part.length > 18),
    ...implied,
  ]).slice(0, 8);

  const meaning = writeMeaning(normalized, implied, asks);
  return {
    normalized,
    asks: asks.length ? asks : implied.length ? implied : split.slice(0, 4),
    meaning,
    mood: inferMood(normalized),
    implied,
  };
}

function writeMeaning(text: string, implied: string[], asks: string[]) {
  const short = text.replace(/\s+/g, " ").slice(0, 160);
  if (!implied.length && asks.length <= 1) {
    if (/^(hi|hey|hello|yo|haan)\b/i.test(text) && text.split(/\s+/).length <= 4) {
      return "they just said hi — reply like a person, nothing else";
    }
    if (/^(ok+|okay|thanks|thank you|thx|theek)\b/i.test(text)) {
      return "they are closing the last beat — a short human ack, no new pitch";
    }
    return `they said: ${short}`;
  }
  const wants = implied.length ? implied.join("; ") : asks.slice(0, 5).join("; ");
  return `they want these things covered, in their words' spirit: ${wants}`;
}
