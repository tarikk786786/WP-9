import type { QuotedContext } from "../turn-builder/index.ts";

export interface ConversationHistoryEntry {
  role: "user" | "assistant";
  text: string;
}

export type QuotedRelationship = "agreement" | "followup_question" | "clarification" | "correction" | "general";

export interface UnderstandingResult {
  rawText: string;
  normalizedText: string;
  semanticMeaning: string;
  language: "hinglish" | "banglish" | "hindi" | "bangla" | "english" | "mixed";
  script: "latin" | "devanagari" | "bengali" | "mixed";
  intents: string[];
  primaryIntent: string;
  entities: Record<string, string | number | boolean | undefined>;
  resolvedPronouns: Array<{ pronoun: string; refersTo: string }>;
  resolvedQuotedContext?: {
    quotedText: string;
    relationship: QuotedRelationship;
    synthesizedMeaning: string;
  };
  isRepair: boolean;
  repairDetails?: {
    rejectedInterpretation: string;
    correction: string;
  };
  emotion: "frustrated" | "angry" | "happy" | "sad" | "neutral" | "playful" | "anxious";
  socialTone: "casual" | "formal" | "slang" | "sarcastic" | "teasing" | "venting" | "urgent" | "polite" | "playful";
  confidence: number;
}

// Common Hinglish / SMS transliteration mappings
const SLANG_DICTIONARY: Record<string, string> = {
  kl: "kal",
  kal: "kal",
  mlt: "milte",
  mlte: "milte",
  h: "hai",
  hn: "haan",
  hnn: "haan",
  ha: "haan",
  yr: "yaar",
  bje: "baje",
  kr: "kar",
  kro: "karo",
  krna: "karna",
  krra: "kar raha",
  rha: "raha",
  rhe: "rahe",
  rhi: "rahi",
  bta: "bata",
  btao: "batao",
  btana: "batana",
  btayiye: "bataiye",
  thk: "theek",
  thik: "theek",
  thek: "theek",
  plz: "please",
  pls: "please",
  kch: "kuch",
  smjh: "samajh",
  smjha: "samjha",
  kyu: "kyun",
  q: "kyun",
  cz: "because",
  bcoz: "because",
  msg: "message",
  u: "you",
  ur: "your",
  r: "are",
  nhi: "nahi",
  nh: "nahi",
  ni: "nahi",
  wbu: "what about you",
  hru: "how are you",
  idk: "i do not know",
  btw: "by the way",
  pr: "par",
  abt: "about",
  opp: "option",
  optn: "option",
};

/** Normalize repeated characters: kyaaa -> kya, bhaiii -> bhai */
export function normalizeCharacterElongation(text: string): string {
  // Replace 3 or more repeated letters with 1 or 2 letters depending on phonetic pattern
  return text.replace(/([a-zA-Z])\1{2,}/g, (_match, char: string) => {
    // Keep double for common vowel/consonant pairs if natural, otherwise single
    if (/^[oe]$/i.test(char)) return char + char; // "sooon" -> "soon", "seeen" -> "seen"
    return char;
  });
}

/** Normalize slang, typos and SMS shorthand into standard tokens */
export function normalizeSlangAndTypos(text: string): string {
  const words = text.split(/(\s+|[.,!?]+)/);
  const normalizedWords = words.map((token) => {
    const lower = token.toLowerCase();
    return SLANG_DICTIONARY[lower] ?? token;
  });
  return normalizedWords.join("");
}

export function detectScript(text: string): UnderstandingResult["script"] {
  const hasDevanagari = /[\u0900-\u097F]/.test(text);
  const hasBengali = /[\u0980-\u09FF]/.test(text);
  const hasLatin = /[a-zA-Z]/.test(text);

  if (hasDevanagari && !hasBengali && !hasLatin) return "devanagari";
  if (hasBengali && !hasDevanagari && !hasLatin) return "bengali";
  if (hasLatin && !hasDevanagari && !hasBengali) return "latin";
  return "mixed";
}

export function detectLanguage(text: string): UnderstandingResult["language"] {
  const script = detectScript(text);
  if (script === "bengali") return "bangla";
  if (script === "devanagari") return "hindi";

  const lower = text.toLowerCase();

  const BANGLA_WORDS = /\b(ami|tumi|kemon|accho|acho|korcho|bhalo|hobe|ekhon|kichu|dada|bhaiya|khobor|ki|kore)\b/i;
  if (BANGLA_WORDS.test(lower)) return "banglish";

  const HINGLISH_WORDS = /\b(kya|hai|hain|haan|nahi|chahiye|bhai|bro|yaar|scene|theek|kal|abhi|kaise|karo|raha|rahe|mujhe|tum|mera|kuch|batao|mila|milna|milte|uska|iska|wala|wali|wale|aisa|waisa|paas|thoda|baat|sun)\b/i;
  if (HINGLISH_WORDS.test(lower)) return "hinglish";

  const ENGLISH_WORDS = /\b(the|is|are|you|your|what|how|price|pricing|cost|available|when|where|meeting|help|support|can|please|thank|thanks)\b/i;
  if (ENGLISH_WORDS.test(lower)) return "english";

  return "hinglish"; // default friendly dialect for regional WhatsApp
}

export function detectEmotionAndTone(text: string): {
  emotion: UnderstandingResult["emotion"];
  socialTone: UnderstandingResult["socialTone"];
} {
  const lower = text.toLowerCase();

  // Frustration / anger / sadness / distress
  if (/(😭|😢|🥺|😔|😞)/.test(text) || /\b(kharab|bekaar|barbaad|dimag kharab|pareshaan|loss|phas gaya|ro raha|dukh|dard)\b/i.test(lower)) {
    return {
      emotion: /(😭|pareshaan|barbaad|dimag kharab)/i.test(text) ? "frustrated" : "sad",
      socialTone: "venting",
    };
  }

  if (/(😡|🤬|😤|😠)/.test(text) || /\b(gussa|bakwas|fraud|cheat|loot|worst|terrible|hate)\b/i.test(lower)) {
    return {
      emotion: "angry",
      socialTone: "urgent",
    };
  }

  // Playful / humor / laughing
  if (/(😂|🤣|😆|😁)/.test(text) || /\b(haha|lmao|lol|mazak|joke|masti)\b/i.test(lower)) {
    return {
      emotion: "happy",
      socialTone: "playful",
    };
  }

  // Urgent
  if (/\b(urgent|jaldi|turant|asap|emergency|fast|abhi ke abhi)\b/i.test(lower)) {
    return {
      emotion: "anxious",
      socialTone: "urgent",
    };
  }

  // Polite / gratitude
  if (/(🙏|❤️|✨)/.test(text) || /\b(shukriya|dhanyawad|thanks|thank you|please|kripya)\b/i.test(lower)) {
    return {
      emotion: "happy",
      socialTone: "polite",
    };
  }

  // Casual / slang
  if (/\b(bhai|bro|yaar|dude|scene|boss)\b/i.test(lower)) {
    return {
      emotion: "neutral",
      socialTone: "casual",
    };
  }

  return {
    emotion: "neutral",
    socialTone: "formal",
  };
}

export function detectRepair(text: string): {
  isRepair: boolean;
  repairDetails?: { rejectedInterpretation: string; correction: string };
} {
  const lower = text.toLowerCase();

  const REPAIR_PATTERNS = [
    /\b(nahi\s+pucha|pucha\s+nahi|ye\s+nahi\s+pucha|price\s+nahi\s+pucha|rate\s+nahi\s+pucha)\b/i,
    /\b(ye\s+nahi\s+bola|maine\s+ye\s+kab\s+bola|galat\s+samjh|galat\s+hai|wrong\s+answer)\b/i,
    /\b(not\s+what\s+i\s+asked|didnt\s+ask\s+(that|about|for)|i\s+meant|i\s+didnt\s+say)\b/i,
    /\b(arre\s+bhai\s+main\s+yeh\s+puch\s+raha\s+tha|ye\s+chodo)\b/i,
  ];

  for (const pat of REPAIR_PATTERNS) {
    if (pat.test(lower)) {
      let rejected = "previous topic";
      // Inspect what was specifically negated before/near nahi pucha / nahi bola
      if (/(?:price|rate|cost|paise|fees)\s+nahi/i.test(lower) || /nahi\s+pucha.*(?:price|rate|cost)/i.test(lower)) {
        rejected = "pricing";
      } else if (/(?:time|timing|kab|date)\s+nahi/i.test(lower) || /nahi\s+pucha.*(?:time|timing|kab)/i.test(lower)) {
        rejected = "timing";
      } else if (/(?:location|kahan|address)\s+nahi/i.test(lower) || /nahi\s+pucha.*(?:location|address|kahan)/i.test(lower)) {
        rejected = "location";
      } else if (/\b(price|rate|cost|paise)\b/i.test(lower)) {
        rejected = "pricing";
      } else if (/\b(time|timing)\b/i.test(lower)) {
        rejected = "timing";
      }

      return {
        isRepair: true,
        repairDetails: {
          rejectedInterpretation: rejected,
          correction: text,
        },
      };
    }
  }

  return { isRepair: false };
}

export function resolvePronounsAndContext(
  text: string,
  history: ConversationHistoryEntry[],
  quoted?: QuotedContext
): {
  resolvedPronouns: Array<{ pronoun: string; refersTo: string }>;
  resolvedQuotedContext?: UnderstandingResult["resolvedQuotedContext"];
} {
  const resolvedPronouns: Array<{ pronoun: string; refersTo: string }> = [];
  const lower = text.toLowerCase();

  // Find most recent candidate entity from history or quoted text
  let candidateEntity: string | null = null;

  if (quoted?.text) {
    candidateEntity = quoted.text.trim();
  } else {
    // Look at last assistant or user message
    for (let i = history.length - 1; i >= 0; i--) {
      const turn = history[i];
      if (turn.text) {
        // Look for recognized subjects: products, prices, appointments, topics
        const priceMatch = turn.text.match(/(?:premium|pro|starter|basic|plan|course|subscription|package|[₹$]\d+)/i);
        if (priceMatch) {
          candidateEntity = priceMatch[0];
          break;
        }
        if (!candidateEntity && turn.text.length < 100) {
          candidateEntity = turn.text.trim();
        }
      }
    }
  }

  // Check for anaphoric pronouns
  const pronounPatterns: Array<{ pronoun: string; regex: RegExp }> = [
    { pronoun: "uska", regex: /\b(uska|uske|uski)\b/i },
    { pronoun: "iska", regex: /\b(iska|iske|iski)\b/i },
    { pronoun: "ye", regex: /\b(yeh?|this)\b/i },
    { pronoun: "woh", regex: /\b(woh?|voh|that)\b/i },
    { pronoun: "kal wala", regex: /\b(kal\s+wala|kal\s+wali|kal\s+wale)\b/i },
    { pronoun: "same one", regex: /\b(same\s+wala|same\s+one|vahi\s+wala)\b/i },
  ];

  for (const { pronoun, regex } of pronounPatterns) {
    if (regex.test(lower) && candidateEntity) {
      resolvedPronouns.push({
        pronoun,
        refersTo: candidateEntity,
      });
    }
  }

  // Resolve Quoted Message relationship
  let resolvedQuotedContext: UnderstandingResult["resolvedQuotedContext"] | undefined;
  if (quoted?.text) {
    const isAgreement = /^(haan|han|yes|done|ok|theek|sahi|bilkul|confirm|chalega)[\s!.]*$/i.test(lower);
    const isQuestion = /\b(kya|kab|kaise|kitna|price|cheaper|discount|sasta|option|alternate)\b/i.test(lower);
    const isCorrection = /\b(nahi|galat|change|cancel)\b/i.test(lower);

    let relationship: QuotedRelationship = "general";
    if (isAgreement) relationship = "agreement";
    else if (isQuestion) relationship = "followup_question";
    else if (isCorrection) relationship = "correction";

    const synthesizedMeaning =
      relationship === "agreement"
        ? `User confirms and agrees to: "${quoted.text}"`
        : relationship === "followup_question"
        ? `User asks about "${text}" regarding quoted: "${quoted.text}"`
        : `User refers to quoted: "${quoted.text}" with comment: "${text}"`;

    resolvedQuotedContext = {
      quotedText: quoted.text,
      relationship,
      synthesizedMeaning,
    };
  }

  return { resolvedPronouns, resolvedQuotedContext };
}

export class UnderstandingEngine {
  public analyze(options: {
    rawText: string;
    history?: ConversationHistoryEntry[];
    quoted?: QuotedContext;
    isGroup?: boolean;
  }): UnderstandingResult {
    const { rawText, history = [], quoted } = options;

    // 1. Never alter raw text
    const elongNormalized = normalizeCharacterElongation(rawText);
    const normalizedText = normalizeSlangAndTypos(elongNormalized);

    // 2. Language & Script
    const script = detectScript(rawText);
    const language = detectLanguage(normalizedText);

    // 3. Emotion & Social Tone
    const { emotion, socialTone } = detectEmotionAndTone(rawText);

    // 4. Repair Detection
    const { isRepair, repairDetails } = detectRepair(normalizedText);

    // 5. Quoted Message & Pronoun Resolution
    const { resolvedPronouns, resolvedQuotedContext } = resolvePronounsAndContext(
      normalizedText,
      history,
      quoted
    );

    // 6. Intents & Entities extraction
    const intents: string[] = [];
    const entities: Record<string, string | number | boolean | undefined> = {};
    const lower = normalizedText.toLowerCase();

    // Intent checks
    if (/\b(weather|barish|baarish|rain|mausam|garmi|sardi)\b/i.test(lower)) {
      intents.push("weather");
    }
    if (/\b(milna|milte|milenge|meeting|meet)\b/i.test(lower) || (/\b(kal|aaj)\b/i.test(lower) && /\b(free|milna|milte|aoge)\b/i.test(lower))) {
      intents.push("meeting_availability");
    }
    if (/\b(price|pricing|cost|kitna|kitne|rate|paise|fees|rupees|sasta|cheaper|discount)\b/i.test(lower)) {
      intents.push("pricing");
    }
    if (/\b(hi|hello|hey|kaise|kya hal|namaste|salam)\b/i.test(lower)) {
      intents.push("greeting");
    }
    if (isRepair) {
      intents.unshift("repair");
    }
    if (emotion === "frustrated" || emotion === "sad") {
      intents.push("venting_support");
    }

    if (intents.length === 0) {
      intents.push("general_conversation");
    }

    const primaryIntent = intents[0];

    // Entities extraction
    if (/\b(kal|tomorrow)\b/i.test(lower)) entities.time = "tomorrow";
    if (/\b(aaj|today)\b/i.test(lower)) entities.time = "today";
    if (/\b(abhi|now)\b/i.test(lower)) entities.time = "now";
    const timeMatch = lower.match(/\b(\d{1,2})\s*(baje|am|pm)\b/i);
    if (timeMatch) entities.specificTime = timeMatch[0];

    // Price query target
    if (resolvedPronouns.length > 0) {
      entities.referencedSubject = resolvedPronouns[0].refersTo;
    }

    // 7. Synthesize semantic meaning
    let semanticMeaning = normalizedText;
    if (isRepair) {
      semanticMeaning = `User is correcting previous turn: did not ask about ${repairDetails?.rejectedInterpretation}, wants: ${repairDetails?.correction}`;
    } else if (resolvedQuotedContext) {
      semanticMeaning = resolvedQuotedContext.synthesizedMeaning;
    } else if (resolvedPronouns.length > 0) {
      semanticMeaning = `${normalizedText} (referring to "${resolvedPronouns[0].refersTo}")`;
    }

    // 8. Confidence calculation
    let confidence = 0.70;
    if (intents.length > 0 && primaryIntent !== "general_conversation") confidence += 0.15;
    if (resolvedPronouns.length > 0 || resolvedQuotedContext) confidence += 0.10;
    if (isRepair) confidence += 0.05;
    if (normalizedText.trim().split(/\s+/).length < 2 && !quoted) confidence -= 0.15;
    confidence = Math.min(0.98, Math.max(0.35, confidence));

    return {
      rawText,
      normalizedText,
      semanticMeaning,
      language,
      script,
      intents,
      primaryIntent,
      entities,
      resolvedPronouns,
      resolvedQuotedContext,
      isRepair,
      repairDetails,
      emotion,
      socialTone,
      confidence,
    };
  }
}

export const understandingEngine = new UnderstandingEngine();
