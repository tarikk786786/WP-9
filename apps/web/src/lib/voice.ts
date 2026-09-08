import { isCannedScript } from "@/lib/hinglish-brain";
import type { BotRules } from "@/lib/types";

export function speakAsTarik(text: string) {
  return text
    .replace(/\bTarik yahan hai\b/gi, "main yahin hoon")
    .replace(/\bTarik yahin hai\b/gi, "main yahin hoon")
    .replace(/\bTarik tak pahunch gaya\b/gi, "dekh liya")
    .replace(/\bMessage Tarik tak pahunch gaya\.?\s*/gi, "")
    .replace(/\bTarik usually\b/gi, "main usually")
    .replace(/\bTarik thoda late\b/gi, "mere side thoda late")
    .replace(/\bTarik sun raha\b/gi, "main sun raha")
    .replace(/\bTarik baat karna\b/gi, "main baat karna")
    .replace(/\bTarik personally\b/gi, "main")
    .replace(/\bmain personally\b/gi, "main")
    .replace(/\bon behalf of\b/gi, "")
    .replace(/\bI am (an )?assistant\b/gi, "tarik hoon")
    .replace(/\bwe are responding\b/gi, "likh raha hoon")
    .replace(/\bTarik will\b/gi, "main")
    .replace(/\bTarik ke naam se\b/gi, "main")
    .replace(/\bpublic facts[^.]*\.\s*/gi, "")
    .replace(/\bcalmly wapas aaunga\.?\s*/gi, "")
    .replace(/\bExtra detail ho to likh dena[^.]*\.\s*/gi, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function unstack(text: string) {
  const stacked = text.match(
    /^(.*?(?:dekh liya|bata|aaunga|hain\.))[.!]?\s+(hey, kaise ho\b.*)$/i,
  );
  if (stacked?.[2]) return stacked[2].replace(/^hey, kaise ho\?[^.]*\.\s*/i, "hey, kya ho raha hai");
  if (/hey, kaise ho/i.test(text) && /dekh liya|pahunch|public facts/i.test(text)) {
    return "hey, kya ho raha hai";
  }
  return text;
}

export function applyVoice(text: string, rules: BotRules) {
  let out = unstack(speakAsTarik(text));

  if (isCannedScript(out)) {
    out = rules.greetingReply || "hey, kya ho raha hai";
  }

  if (rules.tone === "sharp") {
    out = out.replace(/, calmly|, narmi se|bilkul calmly/gi, "").replace(/\s+/g, " ").trim();
  }

  if (rules.language === "english") {
    out = toEnglishSoft(out);
  }
  if (rules.language === "hindi") {
    out = toHindiSoft(out);
  }

  if (rules.emoji && !/[🙂😊]/u.test(out)) {
    out = `${out} 🙂`;
  }

  const sign = rules.signature.trim();
  if (sign && !out.includes(sign) && sign.length < 24) {
    out = `${out}\n${sign}`;
  }

  return out.trim();
}

function toEnglishSoft(text: string) {
  return text
    .replace(/\bkya ho raha hai\b/gi, "what's up")
    .replace(/\bhaan bolo\b/gi, "yeah, tell me")
    .replace(/\bdekh liya\b/gi, "got it")
    .replace(/\bthoda aur bata\b/gi, "give me a bit more");
}

function toHindiSoft(text: string) {
  return text.replace(/\bhey\b/gi, "haan").replace(/\bwhat's up\b/gi, "kya ho raha hai");
}

export function mediaAck(kind: string, rules: BotRules) {
  const base: Record<string, string> = {
    image: "pic aa gayi, dekh raha hoon",
    voice: "sununga. urgent ho to text bhi maar dena",
    video: "video aa gayi, dekh ke likhta hoon",
    document: "file mil gayi. context ek line mein de dena",
    sticker: "haan. bolo",
    location: "location aa gayi",
    contact: "number note kar liya",
  };
  return applyVoice(base[kind] ?? "aa gaya. dekh raha hoon", rules);
}
