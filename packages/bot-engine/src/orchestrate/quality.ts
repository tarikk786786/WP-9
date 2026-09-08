import type { MessageAnalysis } from "../ai/analyze.ts";
import type { ResponsePlan } from "./types.ts";

const PRICE_NUMBER = /\b(?:rs\.?|inr|usd|\$|₹)\s?\d|\b\d{3,7}\s?(?:rs|inr|k|lakh)\b/i;
const BOT_VOICE = /how can i help you today|thanks for reaching out|as an ai|on behalf of/i;

export function checkReplyQuality(text: string, analysis: MessageAnalysis, facts: string[]) {
  const reasons: string[] = [];
  if (!text.trim()) reasons.push("empty");
  if (BOT_VOICE.test(text)) reasons.push("bot-voice");
  if (PRICE_NUMBER.test(text) && !facts.some((fact) => PRICE_NUMBER.test(fact))) {
    reasons.push("invented-price");
  }
  if (analysis.preferredStyle === "complete") {
    const lines = text.split(/\n+/).filter((line) => line.trim().length > 8);
    if (analysis.topics.length > 2 && lines.length < 2) reasons.push("too-thin");
  }
  if (analysis.complexity === "simple" && text.length > 220) reasons.push("too-long");
  return { ok: reasons.length === 0, reasons };
}
