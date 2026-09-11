export interface UnderstandingEntities {
  dates?: string[];
  times?: string[];
  services?: string[];
  locations?: string[];
  numbers?: number[];
  referencedSubject?: string;
}

export interface RepairDetails {
  isRepair: boolean;
  correction?: string;
  originalMisunderstanding?: string;
}

export interface UnderstandingResult {
  rawText: string;
  normalizedText: string;
  detectedLanguage: "hinglish" | "hindi" | "english" | "bengali" | "mixed";
  primaryIntent: string;
  intents: string[];
  entities: UnderstandingEntities;
  isRepair: boolean;
  repairDetails?: RepairDetails;
  emotion: "neutral" | "happy" | "frustrated" | "sad" | "angry" | "curious" | "grateful";
  resolvedPronouns: Record<string, string>;
  resolvedQuotedContext?: string;
  wantsHuman: boolean;
}

export class UnderstandingEngine {
  /**
   * Normalizes character elongations (e.g. "kyaaaa" -> "kya", "bhaiiii" -> "bhai")
   */
  public normalizeElongations(text: string): string {
    return text.replace(/([a-zA-Z])\1{2,}/g, "$1");
  }

  /**
   * Translates common WhatsApp Hinglish slang and abbreviations
   */
  public normalizeSlang(text: string): string {
    let t = text.toLowerCase();

    const slangMap: Record<string, string> = {
      "\\bkl\\b": "kal",
      "\\bmlt\\b": "milte",
      "\\bmlna\\b": "milna",
      "\\bh\\b": "hai",
      "\\bhn\\b": "haan",
      "\\bhan\\b": "haan",
      "\\byr\\b": "yaar",
      "\\bplz\\b": "please",
      "\\bpls\\b": "please",
      "\\bbje\\b": "baje",
      "\\bkr\\b": "kar",
      "\\bkse\\b": "kaise",
      "\\bkya\\s*h\\b": "kya hai",
      "\\bkitna\\s*h\\b": "kitna hai",
      "\\bthx\\b": "thanks",
      "\\bty\\b": "thank you",
      "\\bwhr\\b": "where",
      "\\br8\\b": "rate",
      "\\bprc\\b": "price",
      "\\blctn\\b": "location",
      "\\bavlbl\\b": "available",
    };

    for (const [pattern, replacement] of Object.entries(slangMap)) {
      t = t.replace(new RegExp(pattern, "gi"), replacement);
    }
    return t;
  }

  public normalize(raw: string): string {
    const noElong = this.normalizeElongations(raw.trim());
    return this.normalizeSlang(noElong);
  }

  public detectLanguage(text: string): UnderstandingResult["detectedLanguage"] {
    const bengaliRegex = /[\u0980-\u09FF]/;
    if (bengaliRegex.test(text)) return "bengali";

    const devanagariRegex = /[\u0900-\u097F]/;
    if (devanagariRegex.test(text)) return "hindi";

    const hinglishMarkers = /\b(kya|hai|hoon|yaar|bhai|bhaiya|kal|aaj|kripya|karo|nahi|haan|kaise|kitna|accha|acha)\b/i;
    if (hinglishMarkers.test(text)) return "hinglish";

    const englishMarkers = /\b(what|where|when|price|cost|how|thanks|please|help|meeting|work)\b/i;
    if (englishMarkers.test(text)) return "english";

    return "mixed";
  }

  public detectRepair(text: string): RepairDetails {
    const repairPatterns = [
      /nahi\s+(ye\s+)?(nahi|maine\s+ye\s+nahi|price\s+nahi|ye\s+nahi\s+pucha)/i,
      /(galat\s+samjhe|galat\s+samajh|maine\s+pucha\s+tha|mera\s+matlab)/i,
      /not\s+what\s+i\s+asked|i\s+meant|didn'?t\s+ask/i,
    ];

    for (const pattern of repairPatterns) {
      if (pattern.test(text)) {
        const afterKeyword = text.replace(/^(nahi|galat|not|no|i meant)[\s,]+/i, "").trim();
        return {
          isRepair: true,
          correction: afterKeyword || text,
          originalMisunderstanding: "previous response",
        };
      }
    }

    return { isRepair: false };
  }

  public detectEmotion(text: string): UnderstandingResult["emotion"] {
    if (/😭|😢|frown|dard|dukh|barbaad|sad|pain/i.test(text)) return "sad";
    if (/😡|🤬|gussa|bakwaas|fraud|chutiya|rubbish|waste/i.test(text)) return "angry";
    if (/problem|pareshaan|issue|kharab|not working|fas gaya/i.test(text)) return "frustrated";
    if (/😂|🤣|hahaha|haha|mast|cool|super/i.test(text)) return "happy";
    if (/thanks|thank you|shukriya|dhanyawad|dhanyavad/i.test(text)) return "grateful";
    if (/\?{2,}|kaise|kyun|why|how|kya sach me/i.test(text)) return "curious";
    return "neutral";
  }

  public detectIntents(norm: string): { primary: string; all: string[] } {
    const all: string[] = [];

    if (/\b(human|agent|operator|admin|real person|insan se baat|executive)\b/i.test(norm)) {
      all.push("human_handoff");
    }
    if (/\b(weather|mausam|barish|rain|temperature|dhoop)\b/i.test(norm)) {
      all.push("weather");
    }
    if (/\b(price|pricing|rate|kitne\s+ka|charge|cost|fees|kharidna)\b/i.test(norm)) {
      all.push("pricing");
    }
    if (/\b(delivery|deliver|shipping|kab\s+aayega|pahuch)\b/i.test(norm)) {
      all.push("delivery");
    }
    if (/\b(kal|milte|meeting|call|aao|baat\s+karte|appointment)\b/i.test(norm)) {
      all.push("meeting_availability");
    }
    if (/\b(portfolio|website|link|kaam|work|projects|sample)\b/i.test(norm)) {
      all.push("portfolio");
    }
    if (/\b(hi|hello|hey|salam|namaste|kaise\s+ho)\b/i.test(norm) && all.length === 0) {
      all.push("greeting");
    }
    if (/\b(thanks|thank\s+you|shukriya)\b/i.test(norm)) {
      all.push("gratitude");
    }

    if (all.length === 0) all.push("general_inquiry");
    return { primary: all[0], all };
  }

  public analyze(params: {
    rawText: string;
    quoted?: { text: string; sender?: string };
    history?: Array<{ role: "user" | "assistant"; text: string }>;
  }): UnderstandingResult {
    const normalized = this.normalize(params.rawText);
    const lang = this.detectLanguage(params.rawText);
    const repair = this.detectRepair(normalized);
    const emotion = this.detectEmotion(params.rawText);
    const { primary, all: intents } = this.detectIntents(normalized);

    const wantsHuman = intents.includes("human_handoff");

    // Quoted text resolution
    let resolvedQuotedContext: string | undefined;
    if (params.quoted?.text) {
      resolvedQuotedContext = `User quoted: "${params.quoted.text}". User said: "${params.rawText}"`;
    }

    return {
      rawText: params.rawText,
      normalizedText: normalized,
      detectedLanguage: lang,
      primaryIntent: primary,
      intents,
      entities: {},
      isRepair: repair.isRepair,
      repairDetails: repair,
      emotion,
      resolvedPronouns: {},
      resolvedQuotedContext,
      wantsHuman,
    };
  }
}

export const understandingEngine = new UnderstandingEngine();
