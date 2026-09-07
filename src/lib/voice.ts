import type { BotRules } from "@/lib/types";

export function speakAsTarik(text: string) {
  return text
    .replace(/\bTarik yahan hai\b/gi, "main yahin hoon")
    .replace(/\bTarik yahin hai\b/gi, "main yahin hoon")
    .replace(/\bTarik tak pahunch gaya\b/gi, "mujhe mil gaya")
    .replace(/\bTarik usually\b/gi, "main usually")
    .replace(/\bTarik thoda late\b/gi, "mere side thoda late")
    .replace(/\bTarik sun raha\b/gi, "main sun raha")
    .replace(/\bTarik baat karna\b/gi, "main baat karna")
    .replace(/\bTarik personally\b/gi, "main khud")
    .replace(/\bon behalf of\b/gi, "")
    .replace(/\bI am (an )?assistant\b/gi, "main Tarik hoon")
    .replace(/\bwe are responding\b/gi, "main likh raha hoon")
    .replace(/\bTarik will\b/gi, "main")
    .replace(/\bTarik ke naam se\b/gi, "main")
    .replace(/\s+/g, " ")
    .trim();
}

export function applyVoice(text: string, rules: BotRules) {
  let out = speakAsTarik(text);

  if (rules.tone === "warm") {
    if (!/dil se|pyaar|khushi/i.test(out)) {
      out = `${out} Dil se.`;
    }
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

  if (rules.emoji) {
    out = `${out} 🙂`;
  }

  const sign = rules.signature.trim();
  if (sign && !out.includes(sign)) {
    out = `${out}\n— ${sign}`;
  }

  return out.trim();
}

function toEnglishSoft(text: string) {
  return text
    .replace(/\bkaise ho\b/gi, "how are you")
    .replace(/\baaram se\b/gi, "take it easy")
    .replace(/\bmain yahin hoon\b/gi, "I am right here")
    .replace(/\bmain Tarik Islam hoon\b/gi, "I am Tarik Islam")
    .replace(/\bmain Tarik hoon\b/gi, "I am Tarik")
    .replace(/\bshukriya\b/gi, "thank you")
    .replace(/\btension mat lo\b/gi, "no stress")
    .replace(/\bchhod do\b/gi, "leave a note");
}

function toHindiSoft(text: string) {
  return text
    .replace(/\bhey\b/gi, "namaste")
    .replace(/\bthank you\b/gi, "shukriya")
    .replace(/\btake care\b/gi, "apna khayal rakhna")
    .replace(/\bmessage\b/gi, "sandesh");
}

export function mediaAck(kind: string, rules: BotRules) {
  const base: Record<string, string> = {
    image: "Photo mil gayi. Main dekh raha hoon — caption aur ho to likh dena.",
    voice: "Voice note sununga, quietly. Agar urgent hai to short text bhi chhod dena.",
    video: "Video aa gayi. Main dekh ke wapas aata hoon.",
    document: "File mil gayi. Main khol ke padhunga — context ho to ek line likh dena.",
    sticker: "Sticker aa gaya, smile. Bolo kya kaam hai.",
    location: "Location mil gayi. Jab scope clear ho, main confirm karunga.",
    contact: "Contact mil gaya. Main note kar leta hoon.",
  };
  return applyVoice(base[kind] ?? "Yeh message mil gaya. Main dekh ke wapas aata hoon.", rules);
}
