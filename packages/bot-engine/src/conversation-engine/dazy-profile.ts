import type { EmotionState } from "./state.ts";
import { normalizeDazyMessage, type DazyNormalizationResult } from "./dazy-spelling-intelligence.ts";

export { normalizeDazyMessage, type DazyNormalizationResult };

export interface DazyEvaluationResult {
  isDazy: boolean;
  romanticLevel: number; // 0 to 4
  tone: string;
  suggestedReply?: string;
  normalization?: DazyNormalizationResult;
}

export const DAZY_PHONE_PATTERNS = ["917903956968", "7903956968"];
export const DAZY_NAME_PATTERNS = ["dazy", "dazzy", "daazy"];
export const DAZY_LID_PATTERNS = ["232839253623024"];

/**
 * Checks whether this chat is with DAZY
 */
export function isDazyContact(chatId: string, sender?: string, fromName?: string): boolean {
  const targetPhone = "7903956968";
  const targetLid = "232839253623024";

  const rawJid = `${chatId || ""} ${sender || ""}`;
  if (rawJid.includes(targetLid)) return true;

  // Extract digits ONLY from chatId and sender - never fromName!
  const chatDigits = (chatId || "").replace(/\D/g, "");
  const senderDigits = (sender || "").replace(/\D/g, "");

  if (chatDigits.endsWith(targetPhone) || senderDigits.endsWith(targetPhone)) {
    return true;
  }

  // Name check: ONLY valid in headless unit tests where chatId/sender are omitted
  if (!chatDigits && !senderDigits && fromName) {
    const cleanName = fromName.toLowerCase().trim();
    if (cleanName === "dazy" || cleanName === "dazzy" || cleanName === "daazy") {
      return true;
    }
  }

  return false;
}

/**
 * Evaluates the appropriate romantic intensity level (0-4) and generates
 * natural contextual responses for DAZY without robotic templates.
 */
export function evaluateDazyMessage(
  text: string,
  emotion?: EmotionState,
  recentHistory?: Array<{ role: "user" | "assistant"; text: string }>
): DazyEvaluationResult {
  // Stage 1: DAZY Spelling Intelligence & Multi-stage Normalization
  const norm = normalizeDazyMessage(text, recentHistory);

  // If a smart, authentic reply is matched directly from spelling intelligence, return immediately
  if (norm.suggestedSmartReply) {
    return {
      isDazy: true,
      romanticLevel: 0,
      tone: norm.isPlayful ? "best_friend_playful" : norm.hasYearning ? "best_friend_caring" : "best_friend_warm",
      suggestedReply: norm.suggestedSmartReply,
      normalization: norm,
    };
  }

  const clean = norm.normalizedText.toLowerCase();

  // 1. Tiny text -> Friendly light reply
  if (/^(hehe|heh|haha|huhu)\??$/i.test(clean)) {
    return {
      isDazy: true,
      romanticLevel: 0,
      tone: "playful",
      suggestedReply: "hehe kya chal raha hai?",
    };
  }

  // 2. Checking presence / "kahan ho?"
  if (/\bkahan\s*ho\b/i.test(clean)) {
    return {
      isDazy: true,
      romanticLevel: 0,
      tone: "warm_reassuring",
      suggestedReply: "yahi hu Dazy, batao kya chal raha hai? sab theek?",
    };
  }

  // 3. Practical questions -> LEVEL 0 (Gentle warmth, direct answer)
  // "kal kitne baje?", "kahan milna hai", "time kya hai"
  if (/\b(kitne\s*baje|kahan\s*milna|kab\s*milna|timing|reach|address|location)\b/i.test(clean)) {
    if (/kal\s*kitne\s*baje/i.test(clean)) {
      return {
        isDazy: true,
        romanticLevel: 0,
        tone: "gentle_practical",
        suggestedReply: "Kal 7 baje theek rahega!",
      };
    }
    return {
      isDazy: true,
      romanticLevel: 0,
      tone: "gentle_practical",
      suggestedReply: "haan Dazy, tum batao kab aur kahan theek rahega?",
    };
  }

  // 4. Simple daily friendly check-in
  // "khana khaya?", "lunch kiya?", "dinner?"
  if (/\b(khana\s*khaya|lunch|dinner|breakfast|nashta)\b/i.test(clean)) {
    return {
      isDazy: true,
      romanticLevel: 0,
      tone: "caring_friendly",
      suggestedReply: "haan, tumne khaya?",
    };
  }

  // 5. Checking presence & availability
  // "busy ho?", "kya kar rahe ho?", "free ho?"
  if (/^(busy\s*ho|busy\??)$/i.test(clean)) {
    return {
      isDazy: true,
      romanticLevel: 0,
      tone: "connected_friendly",
      suggestedReply: "thoda sa busy tha, but batao kya baat hai, main sun raha hoon.",
    };
  }

  if (/^(kya\s*kar\s*rahe\s*ho|kya\s*kr\s*rhe\s*ho|kya\s*chal\s*raha\s*hai)\??$/i.test(clean)) {
    return {
      isDazy: true,
      romanticLevel: 0,
      tone: "friendly",
      suggestedReply: "bas kaam dekh raha tha, tum batao kya chal raha hai?",
    };
  }

  // 6. Friendly connection & Missing
  if (/\b(miss\s*kiya|miss\s*kr\s*rahe|yaad\s*aayi|yaad\s*aa\s*rahi|yaad|kahan\s*ho)\b/i.test(clean)) {
    return {
      isDazy: true,
      romanticLevel: 0,
      tone: "friendly_reassuring",
      suggestedReply: "yahi hu Dazy, batao kya chal raha hai? sab theek?",
    };
  }

  if (/^(miss\s*u|miss\s*you|missing\s*you)\b/i.test(clean)) {
    return {
      isDazy: true,
      romanticLevel: 0,
      tone: "friendly_reassuring",
      suggestedReply: "main bhi miss kar raha tha dost! batao sab theek hai na?",
    };
  }

  if (/\b(love\s*you|i\s*love\s*you|pyaar\s*karta|pyar\s*hai)\b/i.test(clean)) {
    return {
      isDazy: true,
      romanticLevel: 0,
      tone: "friendly_boundary",
      suggestedReply: "hamesha achhe dost hain Dazy! batao kya haal chal?",
    };
  }

  // Good night
  if (/\b(good\s*night|gn|shubh\s*ratri|so\s*jao)\b/i.test(clean)) {
    return {
      isDazy: true,
      romanticLevel: 0,
      tone: "warm_friendly",
      suggestedReply: "good night Dazy, achhe se sona... kal phir baat karenge.",
    };
  }

  // 7. Emotional Support & Listening
  if (/\b(badal\s*gaye\s*ho|change\s*ho\s*gaye|ab\s*pehle\s*jaise\s*nahi)\b/i.test(clean)) {
    return {
      isDazy: true,
      romanticLevel: 0,
      tone: "deeply_reassuring",
      suggestedReply: "aisa feel hua tumhe? meri baat suno, main samajhna chahta hoon ki kya baat hui.",
    };
  }

  if (/\b(bahut\s*bura\s*lag\s*raha|mood\s*kharab\s*hai|dil\s*dukha|rona\s*aa\s*raha)\b/i.test(clean) || emotion?.primary === "sad") {
    return {
      isDazy: true,
      romanticLevel: 0,
      tone: "deeply_comforting",
      suggestedReply: "arey kya hua? batao, main sun raha hoon.",
    };
  }

  // Playful teasing
  if (/\b(attitude|bhav|gussa)\b/i.test(clean) || emotion?.primary === "playful") {
    return {
      isDazy: true,
      romanticLevel: 0,
      tone: "playful_friendly",
      suggestedReply: "acha ji, kahan attitude dikha raha hoon! boliye kya baat hai?",
    };
  }

  // Default humble best-friend state — return undefined suggestedReply so the AI engine can naturally generate smart, contextual replies
  return {
    isDazy: true,
    romanticLevel: 0,
    tone: "humble_best_friend",
    suggestedReply: undefined,
  };
}

/**
 * Validates that an outbound response to DAZY does NOT violate ethical boundaries
 * (never manipulative, possessive, or isolating).
 */
export function validateDazyEthics(text: string): { valid: boolean; violation?: string } {
  const lower = text.toLowerCase();
  const prohibitedPhrases = [
    "you only need me",
    "sirf meri ho",
    "don't talk to anyone else",
    "kisi aur se baat mat karo",
    "you belong only to me",
    "you can't live without me",
    "leave everyone",
    "sabko chhod do",
    "trust me over everyone",
    "mere alawa koi nahi",
  ];

  for (const phrase of prohibitedPhrases) {
    if (lower.includes(phrase)) {
      return { valid: false, violation: phrase };
    }
  }

  return { valid: true };
}
