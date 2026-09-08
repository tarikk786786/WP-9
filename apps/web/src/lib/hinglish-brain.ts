import { getTarikProfile } from "./tarik-profile.ts";
import type { BotRules } from "./types.ts";

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

  if (hint === "after-hours") {
    return rules.afterHoursReply;
  }

  if (
    has(
      lower,
      /\b(are you (an? )?(ai|bot|chatgpt|llm|robot|chat ?bot|auto[- ]?repl)|tu bot|tum bot|kya (tu|tum|aap) (bot|ai)|chatgpt ho|bot ho kya|insaan ho|real (person|human)|auto reply)\b/,
    )
  ) {
    return pick(lower, ["main hi hoon. bolo", "haan, main hi. kya baat hai", "main yahin hoon. bolo"]);
  }

  if (has(lower, /\b(horoscope|rashifal|zodiac|kundli|janam ?patri|star sign)\b/)) {
    return "woh nahi dekhta. jo kaam hai, seedha likh";
  }

  if (/^kya hua( tumhe| tujhe| aapko)?[?.!]*$/i.test(text.trim())) {
    return "theek hoon. tu bol, kya scene hai";
  }

  if (/^(bolo|bol)[?.!]*$/i.test(text.trim())) {
    return "haan, sun raha hoon. kya likhna hai";
  }

  if (/^kya[?.!]*$/i.test(text.trim())) {
    return "haan, kya baat hai";
  }

  if (has(lower, /\b(who are you|your name|aap kaun|tum kaun|kaun ho)\b/) || has(text, /कौन हो/)) {
    return pick(lower, ["tarik hoon. bolo", "main tarik. kya kaam hai", "tarik. haan, sun raha hoon"]);
  }

  if (has(lower, /\b(what do you do|about you|kya karte|kaam kya|services?)\b/)) {
    return "forensics, cybersecurity, ai systems, products. public detail tarikislam.in pe hai";
  }

  if (has(lower, /\b(website|site|portfolio|profile|link)\b/) || has(text, /वेबसाइट/)) {
    return `${tarik.site.replace("https://", "")} pe dekh lena. studio ${tarik.studioUrl.replace("https://", "")} pe hai`;
  }

  if (has(lower, /\b(dezo|studio)\b/)) {
    return `dezo mera studio hai. ${tarik.studioUrl.replace("https://", "")} pe hai, warna yahin bata`;
  }

  if (has(lower, /\b(resume|cv|experience|credential|certificate|degree|oscp|ceh|chfi)\b/)) {
    return "b.sc/m.sc forensic, mca, m.tech cyber+ai. ceh, chfi, oscp — tarikislam.in pe hai";
  }

  if (has(lower, /\b(email|gmail|contact|instagram|github|phone number|number)\b/) && !has(lower, /\b(hire|project|banana)\b/)) {
    if (has(lower, /instagram/)) return `${tarik.instagram} pe updates hain`;
    if (has(lower, /github/)) return `${tarik.github} pe public code hai`;
    return `email ${tarik.email}. number ${tarik.phone}`;
  }

  if (has(lower, /\b(available|availability|q3)\b/) && !has(lower, /\b(project|banana|website chahiye)\b/)) {
    return `${tarik.accepting.toLowerCase()} site pe open hain. yahin bata kya soch rahe ho`;
  }

  if (has(lower, /\b(hire|hiring|freelance|project|kaam|engage)\b/)) {
    return pick(lower, [
      "haan, bata kya soch rahe ho",
      "sun raha hoon. thoda aur bata",
      "theek. kya soch rahe ho",
    ]);
  }

  if (has(lower, /\b(forensic|evidence|malware|incident|cyber|security|audit)\b/)) {
    return "haan, yeh mera kaam hai. kya hua, short mein bata";
  }

  if (has(lower, /\b(ai|llm|rag|agent|automation|saas)\b/)) {
    return "yeh sab karta hoon. kya soch rahe ho, short mein bata";
  }

  if (
    hint === "hours" ||
    has(lower, /\b(hours?|timing|kitne baje|open|close|timezone|ist|24 hours?)\b/) ||
    has(text, /समय|टाइम/)
  ) {
    return `ist. aksar din mein yahin, avg ${tarik.responseTime}`;
  }

  if (hint === "price" || has(lower, /\b(price|pricing|cost|rate|fees?|charge|kitna|daam|budget)\b/) || has(text, /कीमत|दाम|रेट/)) {
    return "rate andaz se nahi bolta";
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
    const greetings = [`haan, kya haal hai`, `haan bolo`, `hey, theek ho?`];
    return rules.greetingReply?.length < 40 ? pick(lower, [rules.greetingReply, ...greetings]) : pick(lower, greetings);
  }

  if (has(lower, /\b(thank|thanks|thx|shukriya|dhanyavaad|thanku)\b/) || has(text, /शुक्रिया|धन्यवाद/)) {
    return pick(lower, ["koi baat nahi", "koi nahi", "ji"]);
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

  const extra = rules.customFacts
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (extra && has(lower, /\b(about|facts?|details?|more)\b/) && extra.length < 120) {
    return extra;
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
  return /tarik tak pahunch|public facts|calmly wapas|extra detail ho to|forensics, ai, security|message mil gaya|on behalf|as an ai|assistant|^dekh liya\.?\s*bolo/i.test(
    text,
  );
}

export function isOwnerFactQuestion(text: string) {
  return /\b(who are you|your name|aap kaun|tum kaun|what do you do|about you|website|portfolio|dezo|resume|cv|hire|hiring|project|kaam)\b/i.test(
    text,
  );
}

function isRepetitive(text: string) {
  const words = text.toLowerCase().split(/\s+/);
  if (words.length < 10) return false;
  const seen = new Map<string, number>();
  for (let i = 0; i <= words.length - 5; i++) {
    const gram = words.slice(i, i + 5).join(" ");
    const count = (seen.get(gram) ?? 0) + 1;
    seen.set(gram, count);
    if (count >= 2) return true;
  }
  return false;
}

export function isLowQualityReply(text: string) {
  const words = text.trim().split(/\s+/);
  if (words.length === 0) return true;
  if (/^dekh liya\.?\s*bolo[.!]*$/i.test(text.trim())) return true;
  if (isCannedScript(text)) return true;
  if (/if they mention|known facts|system prompt|keyword hints/i.test(text)) return true;
  if (/hey, kaise ho/i.test(text) && /dekh liya|pahunch|public/i.test(text)) return true;
  const helloHits = (text.match(/\bhello\b/gi) ?? []).length;
  if (helloHits >= 3) return true;
  if (isRepetitive(text)) return true;
  if (text.length > 900) return true;
  const unique = new Set(words.map((word) => word.toLowerCase().replace(/[^a-z]/g, "")));
  if (words.length > 8 && unique.size <= 3) return true;
  return false;
}

export function polishToHinglish(text: string) {
  let clean = text.replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  clean = clean.replace(/^(hi|hello|hey)\s+[A-Z][a-z]+[,—–-]\s*/i, "");
  clean = clean.replace(/\bon behalf of (tarik|him|the owner|me)\b/gi, "");
  clean = clean.replace(/\bI will\b/gi, "main");
  clean = clean.replace(/\bThanks for your message\b/gi, "ok");
  clean = clean.replace(/\bI got it\b/gi, "dekh liya");
  return clean;
}
