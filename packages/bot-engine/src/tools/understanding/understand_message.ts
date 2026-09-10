import type { ToolDefinition } from "../types.ts";
import { normalizeHinglishText } from "./normalize_text.ts";

export type MessageUnderstanding = {
  originalText: string;
  normalizedText: string;
  language: "hinglish" | "hindi" | "english" | "mixed" | "other";
  intent: string;
  tone: "casual" | "formal" | "urgent" | "frustrated" | "affectionate";
  timeReference: string | null;
  requiresReply: boolean;
  confidence: number;
};

export function analyzeUnderstanding(rawText: string): MessageUnderstanding {
  const { normalized } = normalizeHinglishText(rawText);
  const lower = normalized.toLowerCase();

  // Language check
  let language: MessageUnderstanding["language"] = "english";
  const hinglishMarkers = /\b(bhai|yaar|kal|aaj|kya|nahi|batao|milte|chal|raha|hain|karo|acha|sahi)\b/i;
  const devanagari = /[\u0900-\u097F]/;

  if (devanagari.test(rawText)) {
    language = "hindi";
  } else if (hinglishMarkers.test(rawText)) {
    language = "hinglish";
  }

  // Tone detection
  let tone: MessageUnderstanding["tone"] = "casual";
  if (/😭|yaar|plz|urgent|help/i.test(rawText)) {
    tone = "frustrated";
  } else if (/❤️|love|sweet|pyara/i.test(rawText)) {
    tone = "affectionate";
  } else if (/urgent|asap|turant|jaldi/i.test(lower)) {
    tone = "urgent";
  } else if (/sir|ma'am|regards|sincerely/i.test(lower)) {
    tone = "formal";
  }

  // Time reference
  let timeReference: string | null = null;
  if (/\b(kal|tomorrow)\b/i.test(lower)) {
    timeReference = "tomorrow";
  } else if (/\b(aaj|today)\b/i.test(lower)) {
    timeReference = "today";
  } else if (/\b(parso|day after tomorrow)\b/i.test(lower)) {
    timeReference = "day_after_tomorrow";
  }

  // Intent classification
  let intent = "general_chat";
  if (/\b(milna|milte|meet|plans|scene|kya plan)\b/i.test(lower)) {
    intent = "meeting_availability";
  } else if (/\b(baarish|weather|mausam|rain|temperature)\b/i.test(lower)) {
    intent = "weather_inquiry";
  } else if (/\b(price|pricing|cost|kitna|rate|charges)\b/i.test(lower)) {
    intent = "pricing_inquiry";
  } else if (/\b(kaise ho|kya haal|how are you|kya chal raha)\b/i.test(lower)) {
    intent = "greeting_checkin";
  } else if (/\b(thanks|thx|shukriya|dhanyawad)\b/i.test(lower)) {
    intent = "gratitude";
  }

  return {
    originalText: rawText,
    normalizedText: normalized,
    language,
    intent,
    tone,
    timeReference,
    requiresReply: true,
    confidence: 0.94,
  };
}

export const understandMessageTool: ToolDefinition<{ text: string }, MessageUnderstanding> = {
  name: "understand_message",
  category: "understanding",
  description: "Extracts language, intent, tone, time references, and normalized semantics from message",
  parameters: [
    {
      name: "text",
      type: "string",
      description: "Incoming message content",
      required: true,
    },
  ],
  async execute({ text }) {
    const res = analyzeUnderstanding(text);
    return {
      success: true,
      data: res,
      summary: `Intent: ${res.intent}, Tone: ${res.tone}, Language: ${res.language}`,
    };
  },
};
