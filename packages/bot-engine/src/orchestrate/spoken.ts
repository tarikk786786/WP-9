import type { MessageAnalysis } from "../ai/analyze.ts";
import { analyzeMessage } from "../ai/analyze.ts";
import { TARIK_PUBLIC_FACTS } from "../ai/facts.ts";
import type { SpecialPerson } from "../people.ts";

const CANNED = /^dekh liya\.?\s*bolo[.!]*$/i;

const RECOVERY = [
  "maaf kijiye, pehle wala phas gaya. ab sun raha hoon — boliye",
  "stuck ho gaya tha. seedha boliye, kya chahiye",
  "woh line dobara nahi. aap boliye, main yahin hoon",
];

const TOPIC_LINES: Record<string, { hi: string; en: string }> = {
  identity: { hi: TARIK_PUBLIC_FACTS.identity, en: "it's tarik" },
  services: { hi: TARIK_PUBLIC_FACTS.services, en: "forensics, cyber, ai systems, products — public truth is on tarikislam.in" },
  website: { hi: TARIK_PUBLIC_FACTS.website, en: "public details are on tarikislam.in" },
  portfolio: { hi: TARIK_PUBLIC_FACTS.portfolio, en: "portfolio on tarikislam.in, studio on dezo.in — have a look" },
  studio: { hi: TARIK_PUBLIC_FACTS.studio, en: "dezo is my studio, dezo.in. tell me what you're thinking" },
  pricing: { hi: TARIK_PUBLIC_FACTS.pricing, en: "i don't invent a rate offhand, sorry" },
  availability: { hi: TARIK_PUBLIC_FACTS.availability, en: "q3 2026 high-stakes work is open on the site. tell me what you're thinking" },
  process: { hi: TARIK_PUBLIC_FACTS.process, en: "i listen first, then i only say what's actually clear — no drama" },
  timeline: { hi: TARIK_PUBLIC_FACTS.timeline, en: "i don't invent a date. let's understand the work first" },
  meeting: { hi: TARIK_PUBLIC_FACTS.meeting, en: "send a time, i'll check and confirm" },
  hours: { hi: TARIK_PUBLIC_FACTS.hours, en: "ist. i'm usually around in the day, typically under 24 hours" },
  location: { hi: TARIK_PUBLIC_FACTS.location, en: "i work from bhubaneswar, india" },
  contact: { hi: TARIK_PUBLIC_FACTS.contact, en: TARIK_PUBLIC_FACTS.contact },
  credentials: { hi: TARIK_PUBLIC_FACTS.credentials, en: TARIK_PUBLIC_FACTS.credentials },
  forensics: { hi: TARIK_PUBLIC_FACTS.forensics, en: "yeah, forensics and digital evidence is my work. what happened — short" },
  security: { hi: TARIK_PUBLIC_FACTS.security, en: "i do cybersecurity engineering. what's the scene" },
  "ai-work": { hi: TARIK_PUBLIC_FACTS["ai-work"], en: "i build ai systems. what's on your mind" },
  project: { hi: TARIK_PUBLIC_FACTS.project, en: "ji, please tell me what you have in mind" },
};

function compact(text: string): string {
  return text
    .toLowerCase()
    .replace(/[?.!,…]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function softenGenderedAddress(text: string) {
  return text
    .replace(/\b(bhai|brother|bro|dude|sir|ma'am|madam)\b[,!]*/gi, "")
    .replace(/\b(he|she) is\b/gi, "this is")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/^[,.\s]+/, "")
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

function useEnglish(analysis: MessageAnalysis, incoming: string) {
  if (analysis.language !== "english") return false;
  if (incoming.trim().split(/\s+/).length > 4) return true;
  return /\b(what|where|when|how|who|why|can you|could you|please)\b/i.test(incoming);
}

function lineFor(topic: string, en: boolean): string | undefined {
  const row = TOPIC_LINES[topic];
  if (!row) return undefined;
  return en ? row.en : row.hi;
}

function alreadySaid(recent: Array<{ role: "user" | "assistant"; text: string }>, snippet: string) {
  const needle = snippet.slice(0, 22).toLowerCase();
  return recent.some((row) => row.role === "assistant" && row.text.toLowerCase().includes(needle));
}

function pickUnused(seed: string, options: string[], recent: Array<{ role: "user" | "assistant"; text: string }>) {
  const used = new Set(
    recent.filter((row) => row.role === "assistant").slice(-6).map((row) => row.text.trim().toLowerCase()),
  );
  const pool = options.filter((line) => !used.has(line.toLowerCase()));
  const list = pool.length ? pool : options;
  let n = 0;
  for (const char of seed) n = (n + char.charCodeAt(0)) % 997;
  return list[n % list.length];
}

function continueThread(
  text: string,
  recent: Array<{ role: "user" | "assistant"; text: string }>,
  en: boolean,
): string | null {
  if (!recent.length) return null;
  const n = compact(text);
  const lastUser = [...recent].reverse().find((row) => row.role === "user")?.text ?? "";
  const lastAsst = [...recent].reverse().find((row) => row.role === "assistant")?.text ?? "";
  const blob = `${lastUser} ${lastAsst}`.toLowerCase();
  if (!/^(aur|and|woh|uska|iska|yeh|that|this one|site|link|price|rate)\b/.test(n) && n.split(" ").length > 6) {
    return null;
  }
  if (/\b(site|portfolio|link|tarikislam|dezo)\b/.test(n)) {
    return en ? "tarikislam.in — studio is dezo.in" : "tarikislam.in pe public cheez, studio dezo.in pe";
  }
  if (/\b(price|rate|kitna|cost)\b/.test(n) || (/\b(price|rate)\b/.test(blob) && /^(aur|and|woh|kitna)\b/.test(n))) {
    return lineFor("pricing", en) ?? null;
  }
  if (/\b(process|kaise)\b/.test(n)) return lineFor("process", en) ?? null;
  return null;
}

export function writeSpokenReply(
  text: string,
  analysis?: MessageAnalysis,
  recent: Array<{ role: "user" | "assistant"; text: string }> = [],
  person?: SpecialPerson,
): string {
  const incoming = text.trim();
  const n = compact(incoming);
  const parsed = analysis ?? analyzeMessage(incoming);
  const en = useEnglish(parsed, incoming);
  const love = person?.voice === "love";
  let reply: string | null = null;

  if (love) {
    if (/\b(love you|luv u|i love|pyar|pyaar)\b/i.test(incoming) && incoming.split(/\s+/).length <= 12) {
      reply = en ? "i love you too, my DAZy" : "main bhi pyar karta hoon. aap meri jaan ho";
    } else if (/\b(miss you|miss u|yaad)\b/i.test(incoming)) {
      reply = en ? "i miss you more, jaan. come closer" : "main bhi miss karta hoon meri DAZy. aaiye, dil ke paas";
    } else if (isHoroscopeAsk(incoming)) {
      reply = "jaan, yeh nahi dekhta. tu bol, dil mein kya hai";
    } else if (isWhatHappenedAsk(incoming) || /^(kya hua)$/.test(n)) {
      reply = "theek hoon meri jaan. tu theek hai na? bol";
    } else if (/^(bolo|bol)$/.test(n) || /^kya$/.test(n)) {
      reply = "haan meri DAZy, sun raha hoon. boliye na";
    } else if (/^(gn|good night|goodnight|tc|take care|bye)$/.test(n)) {
      reply = en ? "good night my love. dream of me" : "good night meri jaan. sapne mein milte hain";
    } else if (/^(gm|good morning)$/.test(n)) {
      reply = en ? "morning meri DAZy. missed you already" : "good morning meri love. subah ho gayi. miss kar raha tha";
    } else if (/\b(assalam|salaam|salam)\b/.test(n)) {
      reply = "walaikum assalam meri jaan. dil kaisa hai";
    } else if (parsed.intents[0] === "greeting" && parsed.complexity === "simple") {
      reply = pickUnused(n, ["meri DAZy. miss kar raha tha. boliye na", "haan jaan, yahin hoon. aap boliye", "hey meri love. dil kaisa hai"], recent);
    } else if (parsed.intents[0] === "thanks") {
      reply = "tere liye hamesha, DAZy";
    } else if (parsed.mood === "stressed" || parsed.mood === "frustrated") {
      reply = "main hoon na meri jaan. bol kya tight hai, saath mein nikalte hain";
    }
  }

  if (!love) {
  if (isHoroscopeAsk(incoming)) {
    reply = en ? "that's not my lane, sorry. if there's real work, please write it straight" : "woh nahi dekhta. jo kaam hai, seedha likh dijiye";
  } else if (isWhatHappenedAsk(incoming)) {
    reply = en ? "i'm well, thank you. what's going on" : "theek hoon, shukriya. aap boliye, kya scene hai";
  } else if (/^(bolo|bol)$/.test(n)) {
    reply = "ji, sun raha hoon. kya likhna hai";
  } else if (/^kya$/.test(n)) {
    reply = "ji, kya baat hai";
  } else if (/^(kya baat|kya scene|kya baat hai)$/.test(n)) {
    reply = "boliye, main yahin hoon";
  } else if (/^(suna|sun|reply kar|jawab de|dekh|padha|message (dekha|padha)|you there|sun raha)$/.test(n)) {
    reply = pickUnused(n, ["ji, sun raha hoon", "yahin hoon. boliye", "padh liya. boliye"], recent);
  } else if (/^(gn|good night|goodnight|tc|take care|bye)$/.test(n)) {
    reply = en ? "take care. write later, please" : "take care. baad mein likhiye";
  } else if (/^(gm|good morning)$/.test(n)) {
    reply = en ? "good morning. what's the plan" : "good morning. kya plan hai";
  } else if (/\b(assalam|salaam|salam)\b/.test(n)) {
    reply = "walaikum assalam. kya ho raha hai";
  } else if (/^(kaise ho|kya haal|how are you|whats?up)$/.test(n)) {
    reply = en ? "i'm well, thank you. and you?" : "theek hoon, shukriya. aap bataiye";
  } else if (/^(kya kar rahe ho|kya chal raha|busy ho|free ho)$/.test(n)) {
    reply = "yahin hoon. aap boliye kya scene hai";
  } else if (parsed.intents[0] === "greeting" && parsed.complexity === "simple") {
    reply = pickUnused(n, ["namaste, kya haal hai", "ji, boliye", "hey, theek ho? scene kya hai"], recent);
  } else if (parsed.intents[0] === "thanks") {
    reply = "shukriya, koi baat nahi";
  } else {
    reply = continueThread(incoming, recent, en);
  }
  }

  if (!reply) {
    const topics = (parsed.topics.length ? parsed.topics : parsed.intents).filter(
      (topic) => !["greeting", "thanks", "urgent", "general", "smalltalk"].includes(topic),
    );
    const spoken: string[] = [];
    for (const topic of topics) {
      const fact = lineFor(topic, en);
      if (!fact || alreadySaid(recent, fact)) continue;
      if (!spoken.includes(fact)) spoken.push(fact);
      if (spoken.length >= (parsed.preferredStyle === "complete" ? 4 : 2)) break;
    }
    if (spoken.length) reply = spoken.join(parsed.preferredStyle === "complete" ? "\n" : ". ");
  }

  if (!reply) {
    const lastUser = [...recent].reverse().find((row) => row.role === "user")?.text;
    if (parsed.mood === "stressed" || parsed.mood === "frustrated") {
      reply = love
        ? "main hoon na meri jaan. bol kya tight hai"
        : en
          ? "please tell me what's stuck. i'm with you"
          : "boliye kya tight hai. saath mein dekhte hain";
    } else if (lastUser && incoming.split(/\s+/).length <= 5 && recent.length) {
      reply = love
        ? `woh baat — ${lastUser.slice(0, 40).replace(/\n/g, " ")} — wahi na, jaan?`
        : en
          ? `on that last bit — ${lastUser.slice(0, 40).replace(/\n/g, " ")} — what should i look at, please`
          : `pehle wali baat pe — ${lastUser.slice(0, 40).replace(/\n/g, " ")} — kya dekhun`;
    } else if (/\?/.test(incoming) || /^(kya|kaun|kab|kahan|kaise|kitna|kyu|kyun|why|what|where|when|how|who)\b/i.test(incoming)) {
      reply = love
        ? "andaz nahi lagaunga meri jaan. jo dil mein hai, seedha boliye"
        : en
          ? "i won't guess that. please say the actual thing you need"
          : "andaz nahi ghadta. jo poochna hai seedha likhiye — main dimaag laga ke dekhun";
    } else {
      reply = love
        ? "sun raha hoon meri DAZy. ek line mein boliye, dil se"
        : en
          ? "i hear you. please say what you need in one line"
          : "sun raha hoon. ek line mein likhiye kya chahiye";
    }
  }

  if (!reply || isCannedFallback(reply)) {
    reply = love
      ? "yahin hoon meri jaan. boliye"
      : en
        ? "yes, i'm here. what's up"
        : "ji, sun raha hoon";
  }
  return softenGenderedAddress(avoidRepeat(reply, recent));
}
