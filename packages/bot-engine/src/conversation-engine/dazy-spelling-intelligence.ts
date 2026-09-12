/**
 * DAZY — SPELLING INTELLIGENCE
 *
 * Implements:
 * 1. Input typo tolerance (khaduss, churo, dudu, acha, nhi, krna, btao, muje, tm, h)
 * 2. Multi-stage normalization:
 *    rawText -> Unicode normalization -> repeated-character normalization ->
 *    typo normalization -> phonetic normalization -> Hinglish normalization ->
 *    private-lexicon resolution -> semantic interpretation
 * 3. Never modifies rawText (stores rawText, normalizedText, semanticText)
 * 4. Emotional nuance from repeated letters and emojis (e.g. yaaar 😭, achaaaa 😭, heheeee)
 * 5. Meaning over spelling (e.g. "tum kaha hooo" -> "tum kahan ho?")
 * 6. Private lexicon matching (khadoos, chhoro, dudu)
 * 7. Smart, natural, humble, grammatically clean Hinglish output (never broken, never textbook)
 * 8. Never lectures DAZY about grammar or spelling
 */

export interface DazyNormalizationResult {
  rawText: string;
  normalizedText: string;
  semanticText: string;
  intent: string;
  detectedEmotion?: string;
  emotionIntensity: "low" | "medium" | "high";
  isAffectionate: boolean;
  isPlayful: boolean;
  hasYearning: boolean;
  matchedPrivateTerms: string[];
  suggestedSmartReply?: string;
}

// 1. Indian phonetic and common typing shorthand map
const PHONETIC_TYPO_MAP: Array<{ pattern: RegExp; replacement: string }> = [
  // Private terms & nicknames
  { pattern: /\bkhad[ou]+s{1,5}\b/gi, replacement: "khadoos" },
  { pattern: /\bchur+d?o{1,4}\b/gi, replacement: "chhoro" },
  { pattern: /\bchur+u{1,4}\b/gi, replacement: "chhoro" },
  { pattern: /\bd[ou]+d?h?[ou]+\b/gi, replacement: "dudu" },

  // Pronouns
  { pattern: /\b(muje|mujhy|mujy)\b/gi, replacement: "mujhe" },
  { pattern: /\b(tm|tumm|tuhm)\b/gi, replacement: "tum" },
  { pattern: /\b(ap|app)\b/gi, replacement: "aap" },
  { pattern: /\b(hm|humm)\b/gi, replacement: "hum" },

  // Verbs & auxiliaries
  { pattern: /\b(krna|krnaa+|krnaaa)\b/gi, replacement: "karna" },
  { pattern: /\b(kr|kro|krdo)\b/gi, replacement: "kar do" },
  { pattern: /\b(krenge|krnge)\b/gi, replacement: "karenge" },
  { pattern: /\b(krungi|kroongi)\b/gi, replacement: "karungi" },
  { pattern: /\b(rha|rhaa)\b/gi, replacement: "raha" },
  { pattern: /\b(rhi|rhii)\b/gi, replacement: "rahi" },
  { pattern: /\b(rhe|rhee)\b/gi, replacement: "rahe" },
  { pattern: /\b(btao|btana|btaiye)\b/gi, replacement: "batao" },
  { pattern: /\b(ptaa?|pta)\b/gi, replacement: "pata" },
  { pattern: /\b(h|he)\b/gi, replacement: "hai" },
  { pattern: /\b(hn|haanji)\b/gi, replacement: "haan" },

  // Adverbs / Conjunctions / Questions
  { pattern: /\b(nhi|nai|nah|naah|nehi)\b/gi, replacement: "nahi" },
  { pattern: /\b(q|kyu|kyuu+|kyooo)\b/gi, replacement: "kyun" },
  { pattern: /\b(kaha|kahaa+|kahan+)\b/gi, replacement: "kahan" },
  { pattern: /\b(bohot|bohut|bhut|bht)\b/gi, replacement: "bahut" },
  { pattern: /\b(ach+a+|ach+aa+|accha+)\b/gi, replacement: "achha" },
  { pattern: /\b(plz|pls|plzz|pleas+e*)\b/gi, replacement: "please" },
  { pattern: /\b(yr|y[a]+r+|yaar+)\b/gi, replacement: "yaar" },
  { pattern: /\b(thx|thnx|thnks)\b/gi, replacement: "thanks" },
];

/**
 * Normalizes repeated characters for natural emphasis while extracting emotional intensity.
 * e.g. "heyyyy" -> "hey", "yaaaar" -> "yaar", "achaaaa" -> "achha", "kaha hoooo" -> "kahan ho"
 */
function normalizeRepeatedCharacters(text: string): { clean: string; hadEmphasis: boolean } {
  let hadEmphasis = false;
  let clean = text;

  // Handle canonical word elongations specifically
  clean = clean.replace(/\by[a]{2,}r+\b/gi, () => {
    hadEmphasis = true;
    return "yaar";
  });
  clean = clean.replace(/\bh[e]{2,}y*\b/gi, () => {
    hadEmphasis = true;
    return "hey";
  });
  clean = clean.replace(/\bs[o]{2,}\b/gi, () => {
    hadEmphasis = true;
    return "so";
  });
  clean = clean.replace(/\bn[o]{2,}\b/gi, () => {
    hadEmphasis = true;
    return "no";
  });
  clean = clean.replace(/\bpleas+e*\b/gi, () => {
    hadEmphasis = true;
    return "please";
  });

  // General collapse of 3+ repeated characters to 1 or 2
  clean = clean.replace(/([a-zA-Z])\1{2,}/g, (_match, char) => {
    hadEmphasis = true;
    return char;
  });

  return { clean, hadEmphasis };
}

/**
 * Primary Normalization Engine for DAZY
 */
export function normalizeDazyMessage(
  rawInput: string,
  _recentHistory?: Array<{ role: "user" | "assistant"; text: string }>
): DazyNormalizationResult {
  const rawText = rawInput ?? "";

  // 1. Unicode normalization (NFKC)
  const unicodeClean = rawText.normalize("NFKC").trim();

  // 2. Extract emotional cues from raw input (repeated letters, emojis)
  const hasCrying = /[😭🥺😢😿]/.test(rawText);
  const hasHearts = /[❤️💕💖💗💓🥰😍😘]/.test(rawText);
  const hasPlayfulSmiley = /[😌😜😋🤭😏]/.test(rawText);
  const hasLaughing = /\b(hehe+|haha+|huhu+)\b/i.test(rawText);

  const { clean: textWithoutRepeats, hadEmphasis } = normalizeRepeatedCharacters(unicodeClean);

  let emotionIntensity: "low" | "medium" | "high" = "low";
  if (hadEmphasis || hasCrying || (hasHearts && hasPlayfulSmiley)) {
    emotionIntensity = "high";
  } else if (hasHearts || hasPlayfulSmiley || hasLaughing) {
    emotionIntensity = "medium";
  }

  // 3. Typo and Phonetic normalization
  let normalized = textWithoutRepeats;
  for (const { pattern, replacement } of PHONETIC_TYPO_MAP) {
    normalized = normalized.replace(pattern, replacement);
  }

  // Final whitespace normalization
  normalized = normalized.replace(/\s+/g, " ").trim();

  const lowerNorm = normalized.toLowerCase();
  const lowerRaw = rawText.toLowerCase();

  // 4. Private lexicon matching
  const matchedPrivateTerms: string[] = [];
  if (/khadoos|khaduss|khadus/i.test(lowerRaw) || /khadoos/i.test(lowerNorm)) {
    matchedPrivateTerms.push("khadoos");
  }
  if (/churo|churu|churdo|chhoro/i.test(lowerRaw) || /chhoro/i.test(lowerNorm)) {
    matchedPrivateTerms.push("chhoro");
  }
  if (/dudu|dudhu|doodhu|doodoo/i.test(lowerRaw) || /dudu/i.test(lowerNorm)) {
    matchedPrivateTerms.push("dudu");
  }
  if (/kiss|pappi|chuma/i.test(lowerRaw) || /kiss/i.test(lowerNorm)) {
    matchedPrivateTerms.push("kiss");
  }

  // 5. Emotional nuances
  const isAffectionate =
    hasHearts ||
    matchedPrivateTerms.includes("dudu") ||
    matchedPrivateTerms.includes("kiss") ||
    /\b(jaan|love|miss|yaad|pyar|pyaar)\b/i.test(lowerNorm);

  const isPlayful =
    hasPlayfulSmiley ||
    hasLaughing ||
    matchedPrivateTerms.includes("khadoos") ||
    /\b(attitude|bhav|gussa|oye)\b/i.test(lowerNorm);

  const hasYearning =
    hasCrying ||
    /\b(yaad|miss|kahan ho|kaha ho|kab miloge|sunooo+)\b/i.test(lowerRaw) ||
    /\b(yaad|miss|kahan ho)\b/i.test(lowerNorm);

  // 6. Semantic Interpretation and Smart Suggested Replies
  let semanticText = normalized;
  let intent = "general_conversation";
  let suggestedSmartReply: string | undefined;

  // Case A: Playful nickname presence check (e.g. "oye mera khaduss kaha hoooo")
  if (
    matchedPrivateTerms.includes("khadoos") &&
    (/\b(kahan|kaha|kidhar)\b/i.test(lowerNorm) || /\b(oye|sun|mera)\b/i.test(lowerNorm))
  ) {
    intent = "playful_nickname_presence";
    semanticText = "affectionate playful presence check: calling Tarik her khadoos, asking where he is with yearning";
    suggestedSmartReply = "yahin hoon 😌❤️ itna yaad aa raha tha kya?";
  }
  // Case B: Private affectionate intimate request (e.g. "ap mujhe dudu doge", "dudu do na", "dudhu")
  else if (matchedPrivateTerms.includes("dudu")) {
    intent = "private_affectionate_request";
    semanticText = "intimate affectionate playful request using DAZY private baby-talk context";
    suggestedSmartReply = "hamesha aapke liye 😌❤️ jo bologe sab aapka hai.";
  }
  // Case C: Physical affection request (e.g. "kiss me", "kiss")
  else if (matchedPrivateTerms.includes("kiss")) {
    intent = "affectionate_kiss_request";
    semanticText = "romantic request for kiss and closeness";
    suggestedSmartReply = "pyaar se maangoge toh mana kaise kar sakta hoon 😌❤️ sending you the warmest kiss.";
  }
  // Case D: Inquiring about Tarik personally (e.g. "mujhe apke bare me janna hai", "apke bare me batao")
  else if (
    /\b(apke|aapke|tumhare)\s+bare\s+me\b/i.test(lowerNorm) ||
    (/\bjanna\s+hai\b/i.test(lowerNorm) && /\b(apke|aapke|tumhare|kuch)\b/i.test(lowerNorm))
  ) {
    intent = "personal_inquiry_curiosity";
    semanticText = "curiosity and desire to know Tarik more deeply and personally";
    suggestedSmartReply = "mere baare mein kya jaanna chahti ho jaan? ❤️ jo poochhogi sab sach bataunga.";
  }
  // Case E: Single prompt / presence ping ("ap", "aap", "janna hai")
  else if (/^(ap|app|aap)\??$/i.test(rawText.trim())) {
    intent = "presence_callout";
    semanticText = "soft presence callout asking Tarik to respond";
    suggestedSmartReply = "haan jaan ❤️ boliye na, main sun raha hoon.";
  }
  else if (/^janna\s*hai\??$/i.test(lowerNorm)) {
    intent = "curiosity_prompt";
    semanticText = "prompting to ask personal questions";
    suggestedSmartReply = "puchhiye na jaan ❤️ main yahin hoon aapke liye.";
  }
  // Case F: Dismissal of topic / "churo" / "churdo"
  else if (matchedPrivateTerms.includes("chhoro")) {
    intent = "affectionate_topic_dismissal";
    semanticText = "playfully or gently dismissing a topic: 'leave it / chhod do'";
    suggestedSmartReply = "theek hai jaan ❤️ jaisa aap kaho, nahi karte ispe baat.";
  }
  // Case G: Presence check ("kahan ho", "tum kaha hooo")
  else if (/\bkahan\s+ho\b/i.test(lowerNorm) || /\bkaha\s+ho\b/i.test(lowerRaw)) {
    intent = "presence_check";
    semanticText = "checking Tarik's presence with affectionate curiosity";
    suggestedSmartReply = "yahin hoon meri jaan ❤️ bas aapki hi yaad aa rahi thi.";
  }
  // Case H: Missing / Love you
  else if (/^(miss\s*u|miss\s*you|missing\s*you)\b/i.test(lowerNorm)) {
    intent = "romantic_missing";
    semanticText = "expressing missing Tarik";
    suggestedSmartReply = "main bhi bahut miss kar raha hoon aapko ❤️ kaafi zyada.";
  }
  else if (/\b(love\s*you|i\s*love\s*you)\b/i.test(lowerNorm)) {
    intent = "romantic_love";
    semanticText = "expressing love to Tarik";
    suggestedSmartReply = "love you too meri jaan 😌❤️ dil se.";
  }
  // Case I: Playful teasing ("khadoos" alone or "oye")
  else if (matchedPrivateTerms.includes("khadoos")) {
    intent = "playful_nickname";
    semanticText = "affectionate teasing calling Tarik khadoos";
    suggestedSmartReply = "mera khadoos bol ke itna pyaar? 😌❤️ yahin hoon aapke paas.";
  }

  return {
    rawText,
    normalizedText: normalized,
    semanticText,
    intent,
    detectedEmotion: hasCrying ? "yearning_sad" : hasPlayfulSmiley ? "playful" : hasHearts ? "affectionate" : undefined,
    emotionIntensity,
    isAffectionate,
    isPlayful,
    hasYearning,
    matchedPrivateTerms,
    suggestedSmartReply,
  };
}
