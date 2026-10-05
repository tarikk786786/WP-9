export type DetectedLanguage = "hi" | "hi-en" | "en" | "unknown";

export interface LanguageDetectionResult {
  language: DetectedLanguage;
  confidence: number;
  normalizedText: string;
  isColloquialHinglish: boolean;
}

/**
 * Common WhatsApp speech & phonetic normalization map
 * Maps shorthand speech into clean semantic phrases without correcting caller.
 */
const HINGLISH_PHONETIC_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bkya\s+kr\s+rhe\s+ho\b/gi, replacement: "kya kar rahe ho" },
  { pattern: /\bkya\s+kar\s+rha\b/gi, replacement: "kya kar rahe ho" },
  { pattern: /\bsun\s+na+\b/gi, replacement: "sun na" },
  { pattern: /\bek\s+baat\s+puch+u+\b/gi, replacement: "ek baat poochhoon" },
  { pattern: /\bhaan+\s+bolo\b/gi, replacement: "haan bolo" },
  { pattern: /\b(accha+|achha+|acha+)\b/gi, replacement: "achha" },
  { pattern: /\b(nhi|nai|nah)\b/gi, replacement: "nahi" },
  { pattern: /\b(plz|pls)\b/gi, replacement: "please" },
  { pattern: /\b(btao|btana)\b/gi, replacement: "batao" },
  { pattern: /\b(krna|krenge)\b/gi, replacement: "karna" },
];

export class CallLanguageIntelligence {
  // Common Hindi/Hinglish vocabulary tokens
  private static readonly HINDI_TOKENS = new Set([
    "kya", "kar", "rahe", "ho", "hai", "hain", "tha", "thi", "the",
    "batao", "bolo", "sun", "suno", "achha", "nahi", "haan", "kaise",
    "kahan", "kab", "kyun", "chahiye", "main", "mera", "meri", "mere",
    "aap", "tum", "hum", "theek", "kaam", "baat", "karo", "kripya",
    "shukriya", "namaste", "samajh", "aaj", "kal", "abhi"
  ]);

  // Common English vocabulary tokens
  private static readonly ENGLISH_TOKENS = new Set([
    "what", "how", "when", "where", "why", "who", "is", "are", "was",
    "were", "have", "has", "can", "could", "would", "should", "please",
    "tell", "explain", "help", "need", "call", "project", "website",
    "price", "cost", "service", "hello", "hi", "hey", "thanks", "thank"
  ]);

  /**
   * Normalizes phonetic shorthand without altering conversational meaning
   */
  public static normalizePhonetics(text: string): string {
    let clean = text.trim();
    for (const rule of HINGLISH_PHONETIC_REPLACEMENTS) {
      clean = clean.replace(rule.pattern, rule.replacement);
    }
    return clean;
  }

  /**
   * Detects language (Hindi, Hinglish, English, or unknown) and calculates confidence
   */
  public static detectLanguage(rawText: string): LanguageDetectionResult {
    const normalizedText = this.normalizePhonetics(rawText);
    const words = normalizedText
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .split(/\s+/)
      .filter(Boolean);

    if (!words.length) {
      return {
        language: "unknown",
        confidence: 0,
        normalizedText,
        isColloquialHinglish: false,
      };
    }

    let hindiScore = 0;
    let englishScore = 0;

    // Check for Devanagari script (pure Hindi)
    if (/[\u0900-\u097F]/.test(normalizedText)) {
      return {
        language: "hi",
        confidence: 0.98,
        normalizedText,
        isColloquialHinglish: false,
      };
    }

    for (const word of words) {
      if (this.HINDI_TOKENS.has(word)) hindiScore++;
      if (this.ENGLISH_TOKENS.has(word)) englishScore++;
    }

    const totalMatches = hindiScore + englishScore;
    const isColloquialHinglish = hindiScore > 0 && englishScore > 0;

    if (hindiScore > 0 && englishScore > 0) {
      return {
        language: "hi-en",
        confidence: Math.min(0.95, (totalMatches / words.length) * 0.9 + 0.3),
        normalizedText,
        isColloquialHinglish: true,
      };
    }

    if (hindiScore > englishScore) {
      return {
        language: "hi",
        confidence: Math.min(0.95, (hindiScore / words.length) * 0.8 + 0.2),
        normalizedText,
        isColloquialHinglish: false,
      };
    }

    if (englishScore > hindiScore) {
      return {
        language: "en",
        confidence: Math.min(0.95, (englishScore / words.length) * 0.8 + 0.2),
        normalizedText,
        isColloquialHinglish: false,
      };
    }

    return {
      language: "hi-en", // Default to flexible Hinglish for Indian WhatsApp numbers
      confidence: 0.5,
      normalizedText,
      isColloquialHinglish: true,
    };
  }
}
