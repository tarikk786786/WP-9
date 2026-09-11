import type { EmotionState, EmotionType, SpeechAct, UserGoal } from "./state.ts";

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
  semanticText: string;
  detectedLanguage: "hinglish" | "hindi" | "english" | "bengali" | "odia" | "urdu" | "mixed";
  speechAct: SpeechAct;
  primaryIntent: string;
  intents: string[];
  userGoal: UserGoal;
  entities: UnderstandingEntities;
  isRepair: boolean;
  repairDetails?: RepairDetails;
  emotion: EmotionType;
  emotionState: EmotionState;
  urgency: "low" | "medium" | "high";
  resolvedPronouns: Record<string, string>;
  resolvedQuotedContext?: string;
  wantsHuman: boolean;
  isJoke: boolean;
}

export class UnderstandingEngine {
  /**
   * Normalizes character elongations (e.g. "kyaaaa" -> "kya", "bhaiiii" -> "bhai", "okayyy" -> "okay")
   */
  public normalizeElongations(text: string): string {
    return text.replace(/([a-zA-Z])\1{2,}/g, "$1");
  }

  /**
   * Translates common WhatsApp Hinglish slang and abbreviations without unnatural rewriting
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
      "\\bkitne\\s*kaa\\b": "kitne ka",
      "\\bnhi\\b": "nahi",
      "\\bnhiii\\b": "nahi",
      "\\bacha\\b": "accha",
      "\\bachaa\\b": "accha",
      "\\bachha\\b": "accha",
      "\\bthx\\b": "thanks",
      "\\bty\\b": "thank you",
      "\\bwhr\\b": "where",
      "\\br8\\b": "rate",
      "\\bprc\\b": "price",
      "\\blctn\\b": "location",
      "\\bavlbl\\b": "available",
      "\\bokk\\b": "ok",
      "\\bokayy\\b": "okay",
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
    const bengaliRegex = /[\u0980-\u09FF]|(\bbhalo\b|\bkemon\b|\btumi\b|\bkorcho\b)/i;
    if (bengaliRegex.test(text)) return "bengali";

    const odiaRegex = /[\u0B00-\u0B7F]|(\bkemiti\b|\bhau\b|\bachha\b)/i;
    if (odiaRegex.test(text)) return "odia";

    const urduRegex = /[\u0600-\u06FF]|(\bkheriyat\b|\bjanab\b|\bmohtaram\b)/i;
    if (urduRegex.test(text)) return "urdu";

    const devanagariRegex = /[\u0900-\u097F]/;
    if (devanagariRegex.test(text)) return "hindi";

    const hinglishMarkers = /\b(kya|hai|hoon|yaar|bhai|bhaiya|kal|aaj|kripya|karo|nahi|haan|kaise|kitna|accha|acha|arre|dekho|bol)\b/i;
    if (hinglishMarkers.test(text)) return "hinglish";

    const englishMarkers = /\b(what|where|when|price|cost|how|thanks|please|help|meeting|work|delivery|available)\b/i;
    if (englishMarkers.test(text)) return "english";

    return "mixed";
  }

  /**
   * Detects conversational self-corrections and repairs
   */
  public detectRepair(text: string): RepairDetails {
    const repairPatterns = [
      /nahi\s+(ye\s+)?(nahi|maine\s+ye\s+nahi|price\s+nahi|ye\s+nahi\s+pucha)/i,
      /(galat\s+samjhe|galat\s+samajh|maine\s+ye\s+nahi\s+bola|maine\s+pucha\s+tha|mera\s+matlab)/i,
      /not\s+what\s+i\s+asked|i\s+meant|didn'?t\s+ask\s+(that|for\s+price)/i,
      /maine\s+price\s+nahi\s+pucha/i,
      /\bwrong\b|\bgalat\b/i,
    ];

    for (const pattern of repairPatterns) {
      if (pattern.test(text)) {
        const afterKeyword = text.replace(/^(nahi|galat|wrong|not|no|i meant|maine)[\s,]+/i, "").trim();
        return {
          isRepair: true,
          correction: afterKeyword || text,
          originalMisunderstanding: "previous response",
        };
      }
    }

    return { isRepair: false };
  }

  /**
   * Evaluates 18+ contextual emotional states with evidence and intensity
   */
  public analyzeEmotion(text: string, rawText: string): EmotionState {
    const clean = text.toLowerCase();
    const evidence: string[] = [];

    // 1. Relieved / Celebratory Joy (e.g. "finally ho gaya 😭")
    if (/\bfinally\s+ho\s+gaya\b/i.test(clean) || (/\bfinally\b/i.test(clean) && /😭|❤️|celebrate|ho\s*gaya/i.test(rawText))) {
      evidence.push("finally ho gaya celebration");
      return {
        primary: "relieved",
        secondary: "happy",
        intensity: "high",
        confidence: 0.95,
        evidence,
      };
    }

    // 2. Anxious / Worried (e.g. "mujhe tension ho rahi hai")
    if (/\b(tension|dar\s+lag\s+raha|ghabrahat|nervous|worried|anxious)\b/i.test(clean)) {
      evidence.push("explicit anxiety keywords");
      return {
        primary: "anxious",
        secondary: "worried",
        intensity: "high",
        confidence: 0.9,
        evidence,
      };
    }

    // 3. Sad / Disappointed (e.g. "yaar aaj bahut bura din tha", "interview kharab ho gaya")
    if (/\b(bahut\s+bura\s+din|kharab\s+ho\s+gaya|mood\s+off|sad|cry|dil\s+dukha|dard)\b/i.test(clean)) {
      evidence.push("sorrow/disappointment expression");
      return {
        primary: "sad",
        secondary: "disappointed",
        intensity: "high",
        confidence: 0.9,
        evidence,
      };
    }

    // 4. Angry / Indignant (e.g. "bhai ye kya bakwaas hai", "chutiya", "fraud")
    if (/\b(bakwaas|fraud|rubbish|waste|chutiya|gussa|hate|terrible)\b/i.test(clean) || /😡|🤬/.test(rawText)) {
      evidence.push("angry reaction / bakwaas");
      return {
        primary: "angry",
        secondary: "frustrated",
        intensity: "high",
        confidence: 0.95,
        evidence,
      };
    }

    // 5. Frustrated / Annoyed (e.g. "kitni baar bolu", "samajh nahi aa raha?")
    if (/\b(kitni\s+baar\s+bolu|samajh\s+nahi\s+aa\s+raha\?|arey\s+bhai|wrong|fas\s+gaya)\b/i.test(clean)) {
      evidence.push("repetition frustration / misunderstanding");
      return {
        primary: "frustrated",
        intensity: "medium",
        confidence: 0.85,
        evidence,
      };
    }

    // 6. Resigned / Tired (e.g. "chhod yaar")
    if (/^(chhod\s+yaar|rehne\s+do|forget\s+it|thak\s+gaya)\b/i.test(clean)) {
      evidence.push("resignation keyword");
      return {
        primary: "tired",
        secondary: "disappointed",
        intensity: "medium",
        confidence: 0.85,
        evidence,
      };
    }

    // 7. Playful / Sarcastic / Teasing (e.g. "lol tu bhi na 😂", "bhai tu aaj bada intelligent ban raha 😂")
    if (/😂|🤣/.test(rawText) || /\b(lol|haha|intelligent\s+ban\s+raha|shana|smart\s+ban)\b/i.test(clean)) {
      evidence.push("playful emoji / tease");
      return {
        primary: "playful",
        secondary: "sarcastic",
        intensity: "medium",
        confidence: 0.85,
        evidence,
      };
    }

    // 8. Grateful / Warm (e.g. "thank you bhai ❤️", "shukriya")
    if (/\b(thank\s+you|thanks|shukriya|dhanyawad)\b/i.test(clean) || (/[❤️🫶]/.test(rawText) && !/\b(badal\s+gaye|bura)\b/i.test(clean))) {
      evidence.push("gratitude / warmth marker");
      return {
        primary: "grateful",
        secondary: "happy",
        intensity: "medium",
        confidence: 0.9,
        evidence,
      };
    }

    // 9. Hesitant / Casual Disagreement (e.g. "nahi yaar")
    if (/^(nahi\s+yaar|na\s+yaar|not\s+really)\b/i.test(clean)) {
      evidence.push("hesitant negation");
      return {
        primary: "hesitant",
        intensity: "low",
        confidence: 0.8,
        evidence,
      };
    }

    // 10. Confused (e.g. "samajh nahi aa raha")
    if (/\b(samajh\s+nahi\s+aa\s+raha|kuch\s+samajh\s+nahi|confused|unclear)\b/i.test(clean)) {
      evidence.push("confusion indicator");
      return {
        primary: "confused",
        intensity: "medium",
        confidence: 0.85,
        evidence,
      };
    }

    // 11. Curious
    if (/\?{2,}|kaise|kyun|why|how|kya sach me/i.test(clean)) {
      evidence.push("multiple question marks or how/why");
      return {
        primary: "curious",
        intensity: "low",
        confidence: 0.75,
        evidence,
      };
    }

    return {
      primary: "neutral",
      intensity: "low",
      confidence: 0.7,
      evidence: ["default tone"],
    };
  }

  /**
   * Classifies the speech act (speech act category)
   */
  public detectSpeechAct(text: string, emotion: EmotionType, isRepair: boolean): SpeechAct {
    const clean = text.toLowerCase().trim();

    if (isRepair) return "CORRECTION";
    if (/^(haan|hn|yes|sahi hai|theek hai|done|right|bilkul)$/i.test(clean)) return "CONFIRMATION";
    if (/^(nahi|na|no|never|nahi yaar)$/i.test(clean)) return "NEGATION";
    if (/^(ok|okk|okay|hmm|accha|acha|samjha|got it|cool)$/i.test(clean)) return "ACKNOWLEDGEMENT";
    if (/^(thank\s+you|thanks|shukriya|dhanyawad)\b/i.test(clean)) return "ACKNOWLEDGEMENT";
    if (/^(hi|hello|hey|salam|namaste)\b/i.test(clean)) return "SMALL_TALK";
    if (emotion === "playful" && /\b(lol|intelligent\s+ban\s+raha|😂)\b/i.test(clean)) return "JOKE";
    if (emotion === "sad" || emotion === "relieved" || emotion === "anxious" || emotion === "angry") return "EMOTIONAL_EXPRESSION";
    if (/\?$/.test(clean) || /\b(kya|kab|kaise|kitna|kahan|why|when|where|what|how)\b/i.test(clean)) return "QUESTION";
    if (/\b(batao|karo|bhejo|send|please\s+give)\b/i.test(clean)) return "REQUEST";
    return "SMALL_TALK";
  }

  /**
   * Identifies user goals
   */
  public detectUserGoal(text: string, primaryIntent: string, isRepair: boolean, emotion: EmotionType): UserGoal {
    if (isRepair) return "repair_misunderstanding";
    if (primaryIntent === "pricing") return "asking_price";
    if (primaryIntent === "delivery") return "getting_information";
    if (primaryIntent === "meeting_availability") return "booking";
    if (emotion === "angry" || emotion === "frustrated") return "complaining";
    if (emotion === "anxious" || emotion === "sad" || emotion === "tired") return "seeking_reassurance";
    if (primaryIntent === "greeting" || primaryIntent === "gratitude") return "casual_conversation";
    return "getting_information";
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
    const emotionState = this.analyzeEmotion(normalized, params.rawText);
    const speechAct = this.detectSpeechAct(normalized, emotionState.primary, repair.isRepair);
    const textForIntent = params.quoted?.text
      ? `${normalized} ${this.normalize(params.quoted.text)}`
      : normalized;
    const { primary, all: intents } = this.detectIntents(textForIntent);
    const userGoal = this.detectUserGoal(normalized, primary, repair.isRepair, emotionState.primary);

    const wantsHuman = intents.includes("human_handoff");
    const isJoke = speechAct === "JOKE" || emotionState.primary === "playful";

    let urgency: "low" | "medium" | "high" = "low";
    if (/\b(urgent|jaldi|turant|abhee|immediately|emergency|asap)\b/i.test(normalized)) {
      urgency = "high";
    } else if (emotionState.intensity === "high") {
      urgency = "medium";
    }

    // Quoted text resolution
    let resolvedQuotedContext: string | undefined;
    if (params.quoted?.text) {
      resolvedQuotedContext = `User quoted: "${params.quoted.text}". User said: "${params.rawText}"`;
    }

    return {
      rawText: params.rawText,
      normalizedText: normalized,
      semanticText: normalized,
      detectedLanguage: lang,
      speechAct,
      primaryIntent: primary,
      intents,
      userGoal,
      entities: {},
      isRepair: repair.isRepair,
      repairDetails: repair,
      emotion: emotionState.primary,
      emotionState,
      urgency,
      resolvedPronouns: {},
      resolvedQuotedContext,
      wantsHuman,
      isJoke,
    };
  }
}

export const understandingEngine = new UnderstandingEngine();
