import { getTarikProfile } from "./tarik-profile.ts";
import type { BotRules } from "./types.ts";

function firstName(name: string) {
  const first = name.trim().split(/\s+/)[0];
  return first && first !== "Test" ? first : "";
}

function softName(name: string, includeName: boolean) {
  if (!includeName) return "";
  const first = firstName(name);
  return first ? `${first}, ` : "";
}

function has(text: string, pattern: RegExp) {
  return pattern.test(text);
}

export function writeHinglishReply(incoming: string, fromName: string, rules: BotRules, hint?: string) {
  const tarik = getTarikProfile();
  const text = incoming.trim();
  const lower = text.toLowerCase();
  const name = softName(fromName, rules.includeName);
  const open = rules.openHour;
  const close = rules.closeHour;
  const extra = rules.customFacts.trim();

  if (hint === "after-hours") {
    return `${name}${rules.afterHoursReply}`;
  }

  if (
    has(lower, /\b(who are you|your name|aap kaun|tum kaun|owner|tarik)\b/) ||
    has(text, /कौन हो|नाम/)
  ) {
    return `${name}main Tarik Islam hoon — ${tarik.title}. Poori picture ${tarik.site.replace("https://", "")} pe hai.`;
  }

  if (has(lower, /\b(website|site|portfolio|profile|link)\b/) || has(text, /वेबसाइट/)) {
    return `${name}jo verify hai woh yahan hai: ${tarik.site.replace("https://", "")} Studio ${tarik.studioUrl.replace("https://", "")} pe. Jo public nahi, woh main khud bataunga.`;
  }

  if (has(lower, /\b(dezo|studio|company|startup)\b/)) {
    return `${name}Dezo meri studio hai — AI-native, secure-by-design. Charter ${tarik.studioUrl.replace("https://", "")} pe hai. Collaborate karna ho to seedha likh do.`;
  }

  if (has(lower, /\b(hire|hiring|available|availability|freelance|project|kaam|engage)\b/)) {
    return `${name}haan, main ${tarik.accepting} le raha hoon, base ${tarik.base}. Typical reply ${tarik.responseTime}. Short mein batao kya banana hai — main shaanti se padh ke aata hoon.`;
  }

  if (has(lower, /\b(forensic|evidence|malware|incident|cyber|security|audit)\b/)) {
    return `${name}forensics aur defensive security meri practice hai — digital evidence, threat work, audits. Legal-grade claim bina verify kiye nahi dunga. Scope likh do.`;
  }

  if (has(lower, /\b(ai|llm|rag|agent|automation|saas|app|website)\b/)) {
    return `${name}AI systems, agents, automation, full-stack — yeh sab main karta hoon. Kuch invent nahi karunga. Brief bhejo, main dekh ke next step bataunga.`;
  }

  if (has(lower, /\b(resume|cv|experience|credential|certificate)\b/)) {
    return `${name}public credentials ${tarik.site.replace("https://", "")} pe indexed ho rahe hain. Jo verify nahi, woh main claim nahi karta. CV chahiye to yahin likh do, main bhejunga.`;
  }

  if (
    hint === "hours" ||
    has(lower, /\b(hours?|timing|kab|kitne baje|open|close|time)\b/) ||
    has(text, /समय|टाइम|कब/)
  ) {
    return `${name}main usually ${open} se ${close} tak yahin hota hoon, ${tarik.base} se. Tension mat lo — note chhod do, reply ${tarik.responseTime} ke around aa jaata hai.`;
  }

  if (hint === "price" || has(lower, /\b(price|pricing|cost|rate|fees?|charge|kitna|daam|budget)\b/) || has(text, /कीमत|दाम|रेट/)) {
    return `${name}price site pe fix nahi — main andaz nahi lagata. Scope quietly bata do, number main khud dunga.`;
  }

  if (
    hint === "greeting" ||
    has(lower, /^(hi|hii|hello|hey|yo|hola|salam|salaam|namaste|namaskar|kaise ho|kya haal|whats?up)[\s!?.]*$/i)
  ) {
    return `${name}${rules.greetingReply}`;
  }

  if (has(lower, /\b(thank|thanks|thx|shukriya|dhanyavaad|thanku)\b/) || has(text, /शुक्रिया|धन्यवाद/)) {
    return `${name}dil se thank you. Main yahin hoon. Jab mann kare, ${tarik.site.replace("https://", "")} pe aa lena.`;
  }

  if (has(lower, /\b(sorry|maaf|galti|my bad)\b/) || has(text, /माफ|सॉरी/)) {
    return `${name}koi baat nahi, sab theek hai. Dil pe mat lo. Jab ready ho, phir se baat kar lenge.`;
  }

  if (has(lower, /\b(ok|okay|oky|done|theek|thik|acha|accha|cool|great)\b/) && text.split(/\s+/).length <= 4) {
    return `${name}theek hai, quietly noted. Main yahin hoon.`;
  }

  if (has(lower, /\b(call|phone|voice|video|zoom|meet|meeting|milna|baat kar)\b/) || has(text, /कॉल|मीटिंग/)) {
    return `${name}bilkul, baat karna achha lagega. Time bata dena — main confirm karke aa jaunga.`;
  }

  if (has(lower, /\b(where|location|address|map|kahan|kidhar)\b/) || has(text, /कहाँ|पता/)) {
    return `${name}main ${tarik.base} se kaam karta hoon. Exact meet-up tab confirm hota hai jab scope clear ho. Site: ${tarik.site.replace("https://", "")}`;
  }

  if (has(lower, /\b(help|issue|problem|stuck|urgent|jaldi|please|plz)\b/) || has(text, /मदद|समस्या/)) {
    return `${name}main sun raha hoon. Seedha batao kya tight hai — haste ke bina dekhunga, phir ${tarik.responseTime} ke andar wapas aaunga.`;
  }

  if (has(lower, /\b(bye|good ?night|good ?morning|good ?evening|tc|take care|gn)\b/) || has(text, /अलविदा|शुभ/)) {
    return `${name}take care. Aaram se. Jab kaam ho, main yahin mil jaunga.`;
  }

  const fact = rules.keywordRules.find((rule) => rule.enabled && hint === rule.keyword);
  if (fact) {
    return `${name}${fact.reply}`;
  }

  if (extra && has(lower, new RegExp(extra.split("\n")[0]?.slice(0, 12) || "nevermatchxyz", "i"))) {
    return `${name}${extra.split("\n")[0]}`;
  }

  return `${name}${rules.defaultReply}`;
}

export function isOwnerFactQuestion(text: string) {
  return /\b(who are you|your name|aap kaun|hire|hiring|website|site|portfolio|dezo|forensic|cyber|resume|cv|tarik|price|hours|available)\b/i.test(
    text,
  );
}

export function isLowQualityReply(text: string) {
  const words = text.trim().split(/\s+/);
  if (words.length === 0) return true;
  if (/if they mention|known facts|system prompt|keyword hints|on behalf of/i.test(text)) return true;
  const helloHits = (text.match(/\bhello\b/gi) ?? []).length;
  if (helloHits >= 3) return true;
  const unique = new Set(words.map((word) => word.toLowerCase().replace(/[^a-z]/g, "")));
  if (words.length > 8 && unique.size <= 3) return true;
  return false;
}

export function polishToHinglish(text: string, fromName: string, includeName = true) {
  const name = softName(fromName, includeName);
  let clean = text.replace(/\s+/g, " ").trim();
  clean = clean.replace(/^(hi|hello|hey)\s+[A-Z][a-z]+[,—–-]\s*/i, "");
  clean = clean.replace(/\bon behalf of (tarik|him|the owner)\b/gi, "");
  if (/[।?]|kya |hai |aap |main |yaar |theek |Tarik Islam/.test(clean)) {
    return clean.startsWith(name) || !name ? clean : `${name}${clean.charAt(0).toLowerCase()}${clean.slice(1)}`;
  }
  const softer = clean
    .replace(/\bI will\b/gi, "main")
    .replace(/\bThanks for your message\b/gi, "message mujhe mil gaya")
    .replace(/\bI got it\b/gi, "samajh gaya");
  return `${name}${softer.charAt(0).toLowerCase()}${softer.slice(1)}`;
}
