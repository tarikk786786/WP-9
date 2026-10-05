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
  identity: { hi: TARIK_PUBLIC_FACTS.identity, en: "Hello! I'm Tarik Islam — forensic scientist, cybersecurity engineer, and founder of Dezo.in." },
  services: { hi: TARIK_PUBLIC_FACTS.services, en: "I work on digital forensics, cybersecurity, and custom AI systems / software products — details on tarikislam.in" },
  website: { hi: TARIK_PUBLIC_FACTS.website, en: "You can find my portfolio at tarikislam.in and studio at dezo.in" },
  portfolio: { hi: TARIK_PUBLIC_FACTS.portfolio, en: "Portfolio on tarikislam.in, studio on dezo.in — please have a look" },
  studio: { hi: TARIK_PUBLIC_FACTS.studio, en: "Dezo is my AI product studio (dezo.in). Tell me what you'd like to build" },
  pricing: { hi: TARIK_PUBLIC_FACTS.pricing, en: "Pricing depends on the exact scope and technical requirements — I don't quote a rate offhand. Please share what you need and I'll give a clear estimate" },
  availability: { hi: TARIK_PUBLIC_FACTS.availability, en: "Q3 2026 high-stakes engagements are open on the site. Tell me what you have in mind" },
  process: { hi: TARIK_PUBLIC_FACTS.process, en: "I listen to requirements first, then propose a clear, realistic execution roadmap" },
  timeline: { hi: TARIK_PUBLIC_FACTS.timeline, en: "Timeline depends on project scope and deliverables. Once we discuss requirements, I can give an accurate estimate" },
  meeting: { hi: TARIK_PUBLIC_FACTS.meeting, en: "Please share a convenient time slot and I'll confirm my availability" },
  hours: { hi: TARIK_PUBLIC_FACTS.hours, en: "I operate in IST (India). Usually active during the day, response typically under 24 hours" },
  location: { hi: TARIK_PUBLIC_FACTS.location, en: "I work from Bhubaneswar, Odisha, India" },
  contact: { hi: TARIK_PUBLIC_FACTS.contact, en: TARIK_PUBLIC_FACTS.contact },
  credentials: { hi: TARIK_PUBLIC_FACTS.credentials, en: TARIK_PUBLIC_FACTS.credentials },
  forensics: { hi: TARIK_PUBLIC_FACTS.forensics, en: "Yes, digital forensics and cyber evidence is my primary domain. Please briefly share what happened" },
  security: { hi: TARIK_PUBLIC_FACTS.security, en: "I do cybersecurity engineering and zero-trust systems. What's the requirement?" },
  "ai-work": { hi: TARIK_PUBLIC_FACTS["ai-work"], en: "I build custom AI systems, agents, and LLM workflows. What's on your mind?" },
  project: { hi: TARIK_PUBLIC_FACTS.project, en: "Ji, please tell me what you have in mind" },
  weather: { hi: "baarish ke kam chances hain, mausam saaf rahega. aap boliye kya plan hai", en: "looks like clear weather. what's the plan" },
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
  if (analysis.language === "english") return true;
  return /\b(hi|hello|hey|what|where|when|how|who|why|can you|could you|please|thanks|thank you)\b/i.test(incoming);
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
      reply = en ? "always great friends, DAZy" : "hamesha achhe dost hain, DAZy. batao kya haal hai";
    } else if (/\b(miss you|miss u|yaad)\b/i.test(incoming)) {
      reply = en ? "missed talking to you too, DAZy. what's up?" : "main bhi miss kar raha tha dost! batao sab theek hai na?";
    } else if (isHoroscopeAsk(incoming)) {
      reply = "DAZy, yeh sab nahi dekhta. tu bol, kya baat hai";
    } else if (isWhatHappenedAsk(incoming) || /^(kya hua)$/.test(n)) {
      reply = "theek hoon, DAZy. tu theek hai na? bol";
    } else if (/^(bolo|bol)$/.test(n) || /^kya$/.test(n)) {
      reply = "haan DAZy, sun raha hoon. boliye na";
    } else if (/^(gn|good night|goodnight|tc|take care|bye)$/.test(n)) {
      reply = en ? "good night DAZy. sleep well... let's talk tomorrow" : "good night DAZy. achhe se sona... kal baat karte hain";
    } else if (/^(gm|good morning)$/.test(n)) {
      reply = en ? "good morning DAZy. hope you have a great day" : "good morning DAZy. subah ho gayi, batao kya chal raha hai";
    } else if (/\b(assalam|salaam|salam)\b/.test(n)) {
      reply = "walaikum assalam DAZy. kya haal chal?";
    } else if (parsed.intents[0] === "greeting" && parsed.complexity === "simple") {
      reply = pickUnused(n, ["haan DAZy, yahin hoon. boliye na", "hey DAZy, kya chal raha hai?", "haan bolo DAZy, main sun raha hoon"], recent);
    } else if (parsed.intents[0] === "thanks") {
      reply = "tere liye hamesha, DAZy";
    } else if (parsed.mood === "stressed" || parsed.mood === "frustrated") {
      reply = "main hoon na DAZy. bol kya tight hai, saath mein solve karte hain";
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
  } else if (/\b(assalam|salaam|salam|aoa)\b/.test(n)) {
    reply = "Walaikum Assalam! Boliye, kya haal hai?";
  } else if (/\b(namaste|namaskar|pranam)\b/.test(n)) {
    reply = "Namaste! Ji boliye, kya haal hai?";
  } else if (/^(kaise ho|kya haal|how are you|whats?up)$/.test(n)) {
    reply = en ? "I'm well, thank you! And how are you?" : "Main theek hoon, shukriya. Aap bataiye, kya haal hai?";
  } else if (/\b(jazakallah|jazak allah)\b/.test(n)) {
    reply = "Wa Iyyakum! Bahut shukriya.";
  } else if (/^(kya kar rahe ho|kya chal raha|busy ho|free ho)$/.test(n)) {
    reply = "yahin hoon. aap boliye kya scene hai";
  } else if (/\b(baarish|weather|rain|mausam)\b/i.test(incoming)) {
    reply = en ? "looks like clear weather tomorrow. what's the plan" : "kal baarish ke kam chances hain, mausam saaf rahega. aap boliye kya plan hai";
  } else if (/\b(kal milte|kl mlt|kal milna|milte hain|kal milen)\b/i.test(incoming)) {
    reply = en ? "Yes, let's meet tomorrow. What time suits you?" : "Haan, kal milte hain. Kitne baje theek rahega?";
  } else if (parsed.intents[0] === "greeting" && parsed.complexity === "simple") {
    reply = pickUnused(n, ["Hello! Ji boliye, kya haal hai?", "Ji boliye, main sun raha hoon.", "Hello! Boliye, main kaise madad kar sakta hoon?"], recent);
  } else if (parsed.intents[0] === "thanks") {
    reply = "Bahut shukriya! Koi baat nahi";
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
        ? "main hoon na DAZy. bol kya dikkat hai"
        : en
          ? "please tell me what's stuck. i'm with you"
          : "boliye kya tight hai. saath mein dekhte hain";
    } else if (lastUser && incoming.split(/\s+/).length <= 5 && recent.length) {
      reply = love
        ? `woh baat — ${lastUser.slice(0, 40).replace(/\n/g, " ")} — wahi na, DAZy?`
        : en
          ? `on that last bit — ${lastUser.slice(0, 40).replace(/\n/g, " ")} — what should i look at, please`
          : `pehle wali baat pe — ${lastUser.slice(0, 40).replace(/\n/g, " ")} — kya dekhun`;
    } else if (/\?/.test(incoming) || /^(kya|kaun|kab|kahan|kaise|kitna|kyu|kyun|why|what|where|when|how|who)\b/i.test(incoming)) {
      reply = love
        ? "DAZy, seedha bolo, main sun raha hoon"
        : en
          ? "Please feel free to share what you need in detail, I'm happy to help."
          : "Aap requirement thoda detail mein bataiye, main theek se samajh kar guide karta hoon.";
    } else {
      reply = love
        ? "sun raha hoon DAZy. boliye kya baat hai"
        : en
          ? "I'm listening. Please let me know what you have in mind."
          : "Ji, main sun raha hoon. Boliye, kya requirement hai aapki?";
    }
  }

  if (!reply || isCannedFallback(reply)) {
    reply = love
      ? "yahin hoon DAZy, boliye"
      : en
        ? "yes, i'm here. what's up"
        : "ji, sun raha hoon";
  }
  return softenGenderedAddress(avoidRepeat(reply, recent));
}
