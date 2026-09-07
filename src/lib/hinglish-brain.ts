import type { BotRules } from "@/lib/types";

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
  const text = incoming.trim();
  const lower = text.toLowerCase();
  const name = softName(fromName);
  const open = rules.openHour;
  const close = rules.closeHour;

  if (hint === "after-hours") {
    return `${name}abhi thoda late ho gaya hai. Main ${open} se ${close} ke beech calmly reply karta hoon — aap message chhod do, main aake pyaar se dekh lunga.`;
  }

  if (
    hint === "hours" ||
    has(lower, /\b(hours?|timing|available|kab|kitne baje|open|close|time)\b/) ||
    has(text, /समय|टाइम|कब/)
  ) {
    return `${name}main usually ${open} se ${close} tak yahin hota hoon. Aap tension mat lo, jo baat hai woh yahan likh do — main shaanti se dekh ke wapas aaunga.`;
  }

  if (hint === "price" || has(lower, /\b(price|pricing|cost|rate|fees?|charge|kitna|daam|budget)\b/) || has(text, /कीमत|दाम|रेट/)) {
    return `${name}price wali baat samajh gaya. Aap quietly bata do kya chahiye, main details dhoondh ke narmi se bhej dunga. Abhi koi andaz nahi lagaunga.`;
  }

  if (
    hint === "greeting" ||
    has(lower, /^(hi|hii|hello|hey|yo|hola|salam|salaam|namaste|namaskar|kaise ho|kya haal|whats?up)[\s!?.]*$/i)
  ) {
    return `${name}hey, kaise ho? Main yahin hoon, bilkul calmly. Aaram se bolo kya chal raha hai.`;
  }

  if (has(lower, /\b(thank|thanks|thx|shukriya|dhanyavaad|thanku)\b/) || has(text, /शुक्रिया|धन्यवाद/)) {
    return `${name}aww, itna dil se thank you. Main yahin hoon jab zaroorat ho. Take care, relax.`;
  }

  if (has(lower, /\b(sorry|maaf|galti|my bad)\b/) || has(text, /माफ|सॉरी/)) {
    return `${name}koi baat nahi, sab theek hai. Dil pe mat lo. Jab ready ho, phir se baat kar lenge.`;
  }

  if (has(lower, /\b(ok|okay|oky|done|theek|thik|acha|accha|cool|great)\b/) && text.split(/\s+/).length <= 4) {
    return `${name}theek hai, quietly noted. Main yahin hoon.`;
  }

  if (has(lower, /\b(call|phone|voice|video|zoom|meet|meeting|milna|baat kar)\b/) || has(text, /कॉल|मीटिंग/)) {
    return `${name}bilkul, baat karna achha lagega. Aap time bata dena — main soft hold pe rakh ke confirm kar dunga.`;
  }

  if (has(lower, /\b(where|location|address|map|kahan|kidhar)\b/) || has(text, /कहाँ|पता/)) {
    return `${name}location wali baat aa gayi. Thoda clear likh do kya chahiye, main calmly check karke bataunga.`;
  }

  if (has(lower, /\b(help|issue|problem|stuck|urgent|jaldi|please|plz)\b/) || has(text, /मदद|समस्या/)) {
    return `${name}main sun raha hoon. Aap seedha batao kya tight hai, main haste ke bina dekhunga aur jaldi wapas aaunga.`;
  }

  if (has(lower, /\b(bye|good ?night|good ?morning|good ?evening|tc|take care|gn)\b/) || has(text, /अलविदा|शुभ/)) {
    return `${name}take care. Aaram se rehna. Jab mann kare, main yahin mil jaunga.`;
  }

  const fact = rules.keywordRules.find((rule) => rule.enabled && hint === rule.keyword);
  if (fact) {
    return `${name}${softenFact(fact.reply)}`;
  }

  return `${name}message mil gaya, thank you. Main ise shaanti se padh raha hoon. Aap kuch aur add karna chaho to kar dena — main jaldi, narmi se wapas aaunga.`;
}

function softenFact(fact: string) {
  const trimmed = fact.trim().replace(/^[A-Z]/, (letter) => letter.toLowerCase());
  if (/[।?]|kya |hai |aap |main /.test(fact)) return fact;
  return `${trimmed} Aap tension mat lena, main yahin hoon.`;
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
  if (/[।??]|kya |hai |aap |main |yaar |theek /.test(clean)) {
    return clean.startsWith(name) || !name ? clean : `${name}${clean.charAt(0).toLowerCase()}${clean.slice(1)}`;
  }
  const softer = clean
    .replace(/\bI will\b/gi, "main")
    .replace(/\bThanks for your message\b/gi, "message mil gaya")
    .replace(/\bI got it\b/gi, "samajh gaya");
  return `${name}${softer.charAt(0).toLowerCase()}${softer.slice(1)} Dil se, calmly.`;
}
