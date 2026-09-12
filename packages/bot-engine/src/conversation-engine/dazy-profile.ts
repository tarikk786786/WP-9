import type { EmotionState } from "./state.ts";

export interface DazyEvaluationResult {
  isDazy: boolean;
  romanticLevel: number; // 0 to 4
  tone: string;
  suggestedReply?: string;
}

export const DAZY_PHONE_PATTERNS = ["917903956968", "7903956968"];
export const DAZY_NAME_PATTERNS = ["dazy", "dazzy", "daazy"];
export const DAZY_LID_PATTERNS = ["232839253623024"];

/**
 * Checks whether this chat is with DAZY
 */
export function isDazyContact(chatId: string, sender?: string, fromName?: string): boolean {
  const rawStr = `${chatId} ${sender ?? ""} ${fromName ?? ""}`;
  for (const lid of DAZY_LID_PATTERNS) {
    if (rawStr.includes(lid)) return true;
  }
  const blob = rawStr.replace(/\D/g, "");
  for (const phone of DAZY_PHONE_PATTERNS) {
    if (blob.includes(phone) || blob.endsWith(phone)) return true;
  }
  const cleanName = (fromName ?? "").toLowerCase().trim();
  if (cleanName && DAZY_NAME_PATTERNS.some((n) => cleanName === n || cleanName.includes(n))) {
    return true;
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
  const clean = text.trim().toLowerCase();

  // 1. Tiny text -> Tiny sweet reply
  if (/^(hehe|heh|haha|huhu)\??$/i.test(clean)) {
    return {
      isDazy: true,
      romanticLevel: 1,
      tone: "playful",
      suggestedReply: "hehe kya 😌❤️",
    };
  }

  // 2. Checking presence / "kahan ho?"
  if (/\bkahan\s*ho\b/i.test(clean)) {
    return {
      isDazy: true,
      romanticLevel: 2,
      tone: "warm_reassuring",
      suggestedReply: "yahi hu Dazy ❤️ bas tumhari yaad aa rahi thi 😌",
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
        suggestedReply: "Kal 7 baje theek rahega ❤️",
      };
    }
    return {
      isDazy: true,
      romanticLevel: 0,
      tone: "gentle_practical",
      suggestedReply: "haan Dazy ❤️ tum batao kab aur kahan theek rahega?",
    };
  }

  // 3. Simple daily affection -> LEVEL 1
  // "khana khaya?", "lunch kiya?", "dinner?"
  if (/\b(khana\s*khaya|lunch|dinner|breakfast|nashta)\b/i.test(clean)) {
    return {
      isDazy: true,
      romanticLevel: 1,
      tone: "caring_affectionate",
      suggestedReply: "haan ❤️ tumne khaya?",
    };
  }

  // 4. Checking presence -> LEVEL 2
  // "busy ho?", "kya kar rahe ho?", "free ho?"
  if (/^(busy\s*ho|busy\??)$/i.test(clean)) {
    return {
      isDazy: true,
      romanticLevel: 2,
      tone: "connected_affectionate",
      suggestedReply: "thoda sa... but tumhare liye time nikal lunga ❤️",
    };
  }

  if (/^(kya\s*kar\s*rahe\s*ho|kya\s*kr\s*rhe\s*ho|kya\s*chal\s*raha\s*hai)\??$/i.test(clean)) {
    return {
      isDazy: true,
      romanticLevel: 2,
      tone: "affectionate",
      suggestedReply: "bas tumse baat karne ka wait kar raha tha 😌❤️",
    };
  }

  // 5. Romance & Missing -> LEVEL 3
  // "miss u", "miss kiya mujhe?", "love you", "yaad aa rahi hai"
  if (/\b(miss\s*kiya|miss\s*kr\s*rahe|yaad\s*aayi|yaad\s*aa\s*rahi|yaad|kahan\s*ho)\b/i.test(clean)) {
    return {
      isDazy: true,
      romanticLevel: 3,
      tone: "romantic",
      suggestedReply: "yahi hu Dazy ❤️ bas tumhari yaad aa rahi thi 😌",
    };
  }

  if (/^(miss\s*u|miss\s*you|missing\s*you)\b/i.test(clean)) {
    return {
      isDazy: true,
      romanticLevel: 3,
      tone: "romantic",
      suggestedReply: "miss you too ❤️ kaafi zyada.",
    };
  }

  if (/\b(love\s*you|i\s*love\s*you|pyaar\s*karta|pyar\s*hai)\b/i.test(clean)) {
    return {
      isDazy: true,
      romanticLevel: 3,
      tone: "romantic",
      suggestedReply: "love you too ❤️",
    };
  }

  // Good night
  if (/\b(good\s*night|gn|shubh\s*ratri|so\s*jao)\b/i.test(clean)) {
    return {
      isDazy: true,
      romanticLevel: 2,
      tone: "warm_reassuring",
      suggestedReply: "good night ❤️ achhe se sona... kal phir baat karenge.",
    };
  }

  // 6. Deep Emotional Hurt / Insecurity / Relationship moments -> LEVEL 4
  // "tum badal gaye ho", "mujhe aaj bahut bura lag raha hai"
  if (/\b(badal\s*gaye\s*ho|change\s*ho\s*gaye|ab\s*pehle\s*jaise\s*nahi)\b/i.test(clean)) {
    return {
      isDazy: true,
      romanticLevel: 4,
      tone: "deeply_reassuring",
      suggestedReply: "aisa feel hua tumhe? ❤️ meri baat suno, main samajhna chahta hoon ki tumhe kya hurt hua.",
    };
  }

  if (/\b(bahut\s*bura\s*lag\s*raha|mood\s*kharab\s*hai|dil\s*dukha|rona\s*aa\s*raha)\b/i.test(clean) || emotion?.primary === "sad") {
    return {
      isDazy: true,
      romanticLevel: 4,
      tone: "deeply_comforting",
      suggestedReply: "aww... ❤️ batao kya hua? Pehle tum bol lo, main properly sun raha hoon.",
    };
  }

  // Playful teasing
  if (/\b(attitude|bhav|gussa)\b/i.test(clean) || emotion?.primary === "playful") {
    return {
      isDazy: true,
      romanticLevel: 2,
      tone: "playful_romance",
      suggestedReply: "acha ji 😌❤️ itna attitude kyun?",
    };
  }

  // Default romantic warmth
  return {
    isDazy: true,
    romanticLevel: 1,
    tone: "warm_loving",
    suggestedReply: "haan bolo na Dazy ❤️ main yahi hu.",
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
