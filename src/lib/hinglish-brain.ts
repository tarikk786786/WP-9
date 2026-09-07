import { getTarikProfile } from "./tarik-profile.ts";
import type { BotRules } from "./types.ts";

function firstName(name: string) {
  const first = name.trim().split(/\s+/)[0];
  return first && first !== "Test" ? first : "";
}

function has(text: string, pattern: RegExp) {
  return pattern.test(text);
}

function pick(seed: string, options: string[]) {
  let n = 0;
  for (const char of seed) n = (n + char.charCodeAt(0)) % 997;
  return options[n % options.length];
}

export function writeHinglishReply(incoming: string, fromName: string, rules: BotRules, hint?: string) {
  const tarik = getTarikProfile();
  const text = incoming.trim();
  const lower = text.toLowerCase();
  const first = firstName(fromName);
  const open = rules.openHour;
  const close = rules.closeHour;

  if (hint === "after-hours") {
    return rules.afterHoursReply;
  }

  if (has(lower, /\b(who are you|your name|aap kaun|tum kaun|kaun ho)\b/) || has(text, /कौन हो/)) {
    return pick(lower, ["tarik. yahin hoon, bolo", "main tarik. kya kaam hai", "tarik hoon. haan bolo"]);
  }

  if (has(lower, /\b(website|site|portfolio|profile|link)\b/) || has(text, /वेबसाइट/)) {
    return `${tarik.site.replace("https://", "")} pe dekh lena. kuch specific chahiye to yahin likh`;
  }

  if (has(lower, /\b(dezo|studio)\b/)) {
    return `dezo mera studio hai. ${tarik.studioUrl.replace("https://", "")} pe hai, warna yahin bata`;
  }

  if (has(lower, /\b(hire|hiring|available|availability|freelance|project|kaam|engage)\b/)) {
    return pick(lower, [
      "haan, le sakta hoon. short mein bata kya banana hai",
      "available hoon. 2-3 lines mein scope likh de",
      "haan. kya banana hai, seedha likh",
    ]);
  }

  if (has(lower, /\b(forensic|evidence|malware|incident|cyber|security|audit)\b/)) {
    return "haan, yeh mera kaam hai. kya hua, short mein bata";
  }

  if (has(lower, /\b(ai|llm|rag|agent|automation|saas)\b/)) {
    return "yeh sab karta hoon. brief bhej, dekh ke likhta hoon";
  }

  if (has(lower, /\b(resume|cv|experience|credential|certificate)\b/)) {
    return "cv chahiye to yahin bol, bhej dunga";
  }

  if (
    hint === "hours" ||
    has(lower, /\b(hours?|timing|kab|kitne baje|open|close)\b/) ||
    has(text, /समय|टाइम/)
  ) {
    return `zyada tar ${open} se ${close} tak yahin hota hoon. note chhod dena, dekh lunga`;
  }

  if (hint === "price" || has(lower, /\b(price|pricing|cost|rate|fees?|charge|kitna|daam|budget)\b/) || has(text, /कीमत|दाम|रेट/)) {
    return "rate andaz se nahi bolta. kya banana hai, phir number dunga";
  }

  if (has(lower, /assalam|salaam|salam/)) {
    return "walaikum assalam, kya ho raha hai";
  }

  if (has(lower, /good morning|^gm\b/)) {
    return "good morning, kya plan hai";
  }

  if (
    hint === "greeting" ||
    has(lower, /^(hi|hii|hello|hey|yo|hola|namaste|namaskar|kaise ho|kya haal|whats?up|how are you)[\s!?.]*$/i)
  ) {
    const greetings = first
      ? [`hey, kya ho raha hai`, `haan ${first.toLowerCase()}, bolo`, `hey, theek ho?`]
      : [`hey, kya ho raha hai`, `haan bolo`, `hey, theek ho?`];
    return rules.greetingReply?.length < 40 ? pick(lower, [rules.greetingReply, ...greetings]) : pick(lower, greetings);
  }

  if (has(lower, /\b(thank|thanks|thx|shukriya|dhanyavaad|thanku)\b/) || has(text, /शुक्रिया|धन्यवाद/)) {
    return pick(lower, ["all good", "koi baat nahi", "haan, done"]);
  }

  if (has(lower, /\b(sorry|maaf|galti|my bad)\b/) || has(text, /माफ|सॉरी/)) {
    return "koi nahi, chill. phir se likh";
  }

  if (has(lower, /\b(ok|okay|oky|done|theek|thik|acha|accha|cool|great)\b/) && text.split(/\s+/).length <= 4) {
    return "ok";
  }

  if (has(lower, /\b(call|phone|voice|video|zoom|meet|meeting|milna|baat kar)\b/) || has(text, /कॉल|मीटिंग/)) {
    return "haan, time bata. confirm karke aata hoon";
  }

  if (has(lower, /\b(where|location|address|map|kahan|kidhar)\b/) || has(text, /कहाँ|पता/)) {
    return `${tarik.base} se kaam karta hoon. meet tab decide karte hain jab kaam clear ho`;
  }

  if (has(lower, /\b(help|issue|problem|stuck|urgent|jaldi|please|plz)\b/) || has(text, /मदद|समस्या/)) {
    return "bata kya tight hai. dekh raha hoon";
  }

  if (has(lower, /\b(bye|good ?night|tc|take care|gn)\b/) || has(text, /अलविदा|शुभ/)) {
    return "take care. baad mein likhna";
  }

  const fact = rules.keywordRules.find((rule) => rule.enabled && hint === rule.keyword);
  if (fact && !isCannedScript(fact.reply)) {
    return fact.reply;
  }

  if (rules.defaultReply && !isCannedScript(rules.defaultReply) && rules.defaultReply.length < 80) {
    return rules.defaultReply;
  }

  return pick(lower, ["haan, dekh liya. thoda aur bata", "ok, sun raha hoon. detail?", "padh liya. agla part likh"]);
}

export function isCannedScript(text: string) {
  return /tarik tak pahunch|public facts|calmly wapas|extra detail ho to|forensics, ai, security|message mil gaya|on behalf|as an ai|assistant/i.test(
    text,
  );
}

export function isOwnerFactQuestion(text: string) {
  return /\b(who are you|your name|aap kaun|tum kaun|hire|hiring|website|portfolio|dezo|resume|cv)\b/i.test(text);
}

export function isLowQualityReply(text: string) {
  const words = text.trim().split(/\s+/);
  if (words.length === 0) return true;
  if (isCannedScript(text)) return true;
  if (/if they mention|known facts|system prompt|keyword hints/i.test(text)) return true;
  if (/hey, kaise ho/i.test(text) && /dekh liya|pahunch|public/i.test(text)) return true;
  const helloHits = (text.match(/\bhello\b/gi) ?? []).length;
  if (helloHits >= 3) return true;
  if (text.length > 240) return true;
  const unique = new Set(words.map((word) => word.toLowerCase().replace(/[^a-z]/g, "")));
  if (words.length > 8 && unique.size <= 3) return true;
  return false;
}

export function polishToHinglish(text: string) {
  let clean = text.replace(/\s+/g, " ").trim();
  clean = clean.replace(/^(hi|hello|hey)\s+[A-Z][a-z]+[,—–-]\s*/i, "");
  clean = clean.replace(/\bon behalf of (tarik|him|the owner)\b/gi, "");
  clean = clean.replace(/\bI will\b/gi, "main");
  clean = clean.replace(/\bThanks for your message\b/gi, "ok");
  clean = clean.replace(/\bI got it\b/gi, "dekh liya");
  return clean;
}
