import { getTarikProfile } from "./tarik-profile.ts";
import type { BotRules } from "./types.ts";

function firstName(name: string) {
  const first = name.trim().split(/\s+/)[0];
  return first && first !== "Test" ? first : "";
}

function softName(name: string) {
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
  const name = softName(fromName);
  const open = rules.openHour;
  const close = rules.closeHour;

  if (hint === "after-hours") {
    return `${name}Tarik thoda late hours mein hai. Woh ${open} se ${close} ke beech calmly reply karta hai — aap message chhod do, woh ${tarik.responseTime} ke andar narmi se wapas aayega.`;
  }

  if (
    has(lower, /\b(who are you|your name|aap kaun|tum kaun|owner|tarik)\b/) ||
    has(text, /कौन हो|नाम/)
  ) {
    return `${name}main Tarik Islam hoon — ${tarik.title}. Poori picture ${tarik.site.replace("https://", "")} pe hai, quietly padh lena.`;
  }

  if (has(lower, /\b(website|site|portfolio|profile|link)\b/) || has(text, /वेबसाइट/)) {
    return `${name}sab verified detail yahan hai: ${tarik.site} Studio wala kaam ${tarik.studioUrl.replace("https://", "")} pe. Jo public nahi hai, woh main personally bataunga.`;
  }

  if (has(lower, /\b(dezo|studio|company|startup)\b/)) {
    return `${name}Dezo meri studio hai — AI-native, secure-by-design products. Charter ${tarik.studioUrl.replace("https://", "")} pe hai. Agar collaborate karna hai to seedha likh do.`;
  }

  if (has(lower, /\b(hire|hiring|available|availability|freelance|project|kaam|engage)\b/)) {
    return `${name}haan, Tarik ${tarik.accepting} le raha hai, base ${tarik.base}. Typical reply ${tarik.responseTime}. Short mein batao kya banana hai — main shaanti se padh ke aata hoon.`;
  }

  if (has(lower, /\b(forensic|evidence|malware|incident|cyber|security|audit)\b/)) {
    return `${name}forensics aur defensive security meri practice hai — digital evidence, threat work, audits. Legal-grade claim bina verify kiye nahi dunga. Scope likh do, main ${tarik.site.replace("https://", "")} ke hisaab se follow up karunga.`;
  }

  if (has(lower, /\b(ai|llm|rag|agent|automation|saas|app|website)\b/)) {
    return `${name}AI systems, agents, automation, aur full-stack product — yeh sab Tarik karta hai. Kuch invent nahi karunga. Brief bhejo, main calmly dekh ke next step bataunga.`;
  }

  if (has(lower, /\b(resume|cv|experience|credential|certificate)\b/)) {
    return `${name}public credentials ${tarik.site.replace("https://", "")} pe indexed ho rahe hain. Jo verify nahi hua, woh main claim nahi karta. CV chahiye ho to yahin likh do, Tarik personally bhejega.`;
  }

  if (
    hint === "hours" ||
    has(lower, /\b(hours?|timing|kab|kitne baje|open|close|time)\b/) ||
    has(text, /समय|टाइम|कब/)
  ) {
    return `${name}Tarik usually ${open} se ${close} tak yahin hota hai, ${tarik.base} se. Tension mat lo — note chhod do, reply ${tarik.responseTime} ke around aa jaata hai.`;
  }

  if (hint === "price" || has(lower, /\b(price|pricing|cost|rate|fees?|charge|kitna|daam|budget)\b/) || has(text, /कीमत|दाम|रेट/)) {
    return `${name}price site pe fix nahi likhi — Tarik andaz nahi lagata. Aap quietly scope bata do, woh ${tarik.site.replace("https://", "")} ke kaam ke hisaab se personally number dega.`;
  }

  if (
    hint === "greeting" ||
    has(lower, /^(hi|hii|hello|hey|yo|hola|salam|salaam|namaste|namaskar|kaise ho|kya haal|whats?up)[\s!?.]*$/i)
  ) {
    return `${name}hey, kaise ho? Tarik yahan hai — forensics, AI, security. Aaram se bolo kya chal raha hai.`;
  }

  if (has(lower, /\b(thank|thanks|thx|shukriya|dhanyavaad|thanku)\b/) || has(text, /शुक्रिया|धन्यवाद/)) {
    return `${name}dil se thank you. Tarik yahin hai. Jab mann kare, ${tarik.site.replace("https://", "")} pe bhi aa lena.`;
  }

  if (has(lower, /\b(sorry|maaf|galti|my bad)\b/) || has(text, /माफ|सॉरी/)) {
    return `${name}koi baat nahi, sab theek hai. Dil pe mat lo. Jab ready ho, phir se baat kar lenge.`;
  }

  if (has(lower, /\b(ok|okay|oky|done|theek|thik|acha|accha|cool|great)\b/) && text.split(/\s+/).length <= 4) {
    return `${name}theek hai, quietly noted. Tarik yahin hai.`;
  }

  if (has(lower, /\b(call|phone|voice|video|zoom|meet|meeting|milna|baat kar)\b/) || has(text, /कॉल|मीटिंग/)) {
    return `${name}bilkul, Tarik baat karna pasand karta hai. Time bata dena — confirm karke, narmi se aa jaunga.`;
  }

  if (has(lower, /\b(where|location|address|map|kahan|kidhar)\b/) || has(text, /कहाँ|पता/)) {
    return `${name}Tarik ${tarik.base} se kaam karta hai. Exact meet-up tab confirm hota hai jab scope clear ho. Website: ${tarik.site.replace("https://", "")}`;
  }

  if (has(lower, /\b(help|issue|problem|stuck|urgent|jaldi|please|plz)\b/) || has(text, /मदद|समस्या/)) {
    return `${name}Tarik sun raha hai. Seedha batao kya tight hai — haste ke bina dekhega, phir ${tarik.responseTime} ke andar wapas aayega.`;
  }

  if (has(lower, /\b(bye|good ?night|good ?morning|good ?evening|tc|take care|gn)\b/) || has(text, /अलविदा|शुभ/)) {
    return `${name}take care. Aaram se. Jab kaam ho, Tarik yahin mil jaayega.`;
  }

  const fact = rules.keywordRules.find((rule) => rule.enabled && hint === rule.keyword);
  if (fact) {
    return `${name}${softenFact(fact.reply)}`;
  }

  return `${name}message Tarik tak pahunch gaya. Main ise shaanti se padh raha hoon — extra detail ho to likh dena. Jo public fact chahiye woh ${tarik.site.replace("https://", "")} pe hai, baaki main personally, calmly wapas aaunga.`;
}

function softenFact(fact: string) {
  const trimmed = fact.trim().replace(/^[A-Z]/, (letter) => letter.toLowerCase());
  if (/[।?]|kya |hai |aap |main |Tarik/.test(fact)) return fact;
  return `${trimmed} Tension mat lena, Tarik yahin hai.`;
}

export function isLowQualityReply(text: string) {
  const words = text.trim().split(/\s+/);
  if (words.length === 0) return true;
  const helloHits = (text.match(/\bhello\b/gi) ?? []).length;
  if (helloHits >= 3) return true;
  const unique = new Set(words.map((word) => word.toLowerCase().replace(/[^a-z]/g, "")));
  if (words.length > 8 && unique.size <= 3) return true;
  return false;
}

export function polishToHinglish(text: string, fromName: string) {
  const name = softName(fromName);
  let clean = text.replace(/\s+/g, " ").trim();
  clean = clean.replace(/^(hi|hello|hey)\s+[A-Z][a-z]+[,—–-]\s*/i, "");
  if (/[।?]|kya |hai |aap |main |yaar |theek |Tarik/.test(clean)) {
    return clean.startsWith(name) || !name ? clean : `${name}${clean.charAt(0).toLowerCase()}${clean.slice(1)}`;
  }
  const softer = clean
    .replace(/\bI will\b/gi, "main")
    .replace(/\bThanks for your message\b/gi, "message Tarik tak pahunch gaya")
    .replace(/\bI got it\b/gi, "samajh gaya");
  return `${name}${softer.charAt(0).toLowerCase()}${softer.slice(1)} Tarik yahin hai, calmly.`;
}
