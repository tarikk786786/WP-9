import type { MessageAnalysis } from "../ai/analyze.ts";

const PRICE_NUMBER = /\b(?:rs\.?|inr|usd|\$|₹)\s?\d|\b\d{3,7}\s?(?:rs|inr|k|lakh)\b/i;
const BOT_VOICE =
  /how can i help you today|thanks for reaching out|as an ai|on behalf of|we can definitely|i'd be happy|feel free to|looking forward|audits are my thing|i'll check my schedule|i'm mostly around|leave a note|i am the best|world[- ]class|guaranteed|100%|oversell|i('m| am) (an? )?(ai|bot|chatgpt|chat ?bot|language model)|personal ai|auto[- ]?repl|chatbot/i;
const LEAD = /\b(brief chahiye|3 lines|kis ke liye, kab tak|scope then|scope pe depend|uske hisaab se approach|rate final|rate scope pe depend|note chhod|lead|inbound|book a call|send (me )?your (budget|requirement)|kaam ho sakta hai|exactly kya banana)\b/i;

export function checkReplyQuality(text: string, analysis: MessageAnalysis, facts: string[]) {
  const reasons: string[] = [];
  if (!text.trim()) reasons.push("empty");
  if (BOT_VOICE.test(text) || LEAD.test(text)) reasons.push("bot-voice");
  if (PRICE_NUMBER.test(text) && !facts.some((fact) => PRICE_NUMBER.test(fact))) {
    reasons.push("invented-price");
  }
  const questions = (text.match(/\?/g) ?? []).length;
  if (questions > 2) reasons.push("too-many-questions");
  if (/^hey,?\s*bolo\s*$/i.test(text.trim()) && analysis.topics.some((topic) => topic !== "greeting")) {
    reasons.push("empty-greet");
  }
  if (analysis.preferredStyle === "complete") {
    const lines = text.split(/\n+/).filter((line) => line.trim().length > 8);
    if ((analysis.topics.length > 2 || analysis.asks.length > 2) && lines.length < 2) reasons.push("too-thin");
  }
  if (analysis.complexity === "simple" && text.length > 180) reasons.push("too-long");
  return { ok: reasons.length === 0, reasons };
}
