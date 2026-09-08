import { analyzeMessage, type MessageAnalysis } from "../ai/analyze.ts";
import type { ConversationalAction, ResponsePlan, UserStyle } from "./types.ts";

const HINGLISH = /\b(kya|hai|haan|nahi|chahiye|bolo|kaam|thoda|bhai|bro|yaar|scene|theek|kal|abhi)\b/i;
const SLANG = /\b(bro|bhai|yaar|dude|lol|lmao|okw|oky|hlo|plz|pls)\b/i;
const EMOJI = /\p{Extended_Pictographic}/u;

const TYPOS: Array<{ pattern: RegExp; meaning: string }> = [
  { pattern: /\bpric(e|ing)?s?\b|\bprce\b|\bprize\b/i, meaning: "pricing" },
  { pattern: /\bbudje?t\b/i, meaning: "pricing" },
  { pattern: /\bavailble\b|\bavaliable\b/i, meaning: "availability" },
  { pattern: /\bwebsit\b|\bwebiste\b/i, meaning: "website" },
  { pattern: /\bportfolo\b|\bportfilio\b/i, meaning: "portfolio" },
  { pattern: /\bkal mil(ga|ega|na)?\b/i, meaning: "meeting" },
];

export function detectLanguage(text: string): UserStyle["language"] {
  if (/[\u0980-\u09FF]/.test(text)) return "bengali";
  if (/[\u0600-\u06FF]/.test(text) && !/[\u0900-\u097F]/.test(text)) return "urdu";
  if (/[\u0900-\u097F]/.test(text) && HINGLISH.test(text)) return "hinglish";
  if (/[\u0900-\u097F]/.test(text)) return "hindi";
  if (HINGLISH.test(text)) return "hinglish";
  return "english";
}

export function expandTypos(text: string): string[] {
  return TYPOS.filter((row) => row.pattern.test(text)).map((row) => row.meaning);
}

export function inferUserStyle(
  text: string,
  recent: Array<{ role: "user" | "assistant"; text: string }>,
): UserStyle {
  const userTurns = [...recent.filter((row) => row.role === "user").map((row) => row.text), text];
  const blob = userTurns.slice(-12).join("\n");
  const lengths = userTurns.map((turn) => turn.trim().split(/\s+/).length);
  const avgLength = lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 8;
  return {
    language: detectLanguage(blob),
    formality: SLANG.test(blob) || avgLength < 8 ? "low" : "medium",
    avgLength,
    usesEmoji: EMOJI.test(blob),
    usesSlang: SLANG.test(blob),
  };
}

export function conversationSummary(recent: Array<{ role: "user" | "assistant"; text: string }>): string {
  const last = recent.slice(-10);
  if (!last.length) return "No prior thread.";
  return last.map((row) => `${row.role}: ${row.text.slice(0, 140)}`).join("\n");
}

export function isIncompleteFollowup(
  text: string,
  recent: Array<{ role: "user" | "assistant"; text: string }>,
): boolean {
  const body = text.trim();
  if (/^(kal|tomorrow)\??$/i.test(body)) return true;
  if (!recent.length) return false;
  const words = body.split(/\s+/).filter(Boolean);
  if (words.length > 6) return false;
  return /^(tomorrow|kal|which one|woh|yeh|that one|this one|uska|iska)\b/i.test(body);
}

const ACK = /^(ok+|okay|oky|theek|thik|acha|accha|hmm+|haan|han|done|cool|great|nice|👍)[\s!.]*$/i;

function mediaAction(messageType: string): ConversationalAction | null {
  if (messageType === "audio" || messageType === "image" || messageType === "video" || messageType === "document") {
    return "ask";
  }
  return null;
}

export function planTurn(options: {
  text: string;
  messageType?: string;
  recent: Array<{ role: "user" | "assistant"; text: string }>;
  analysis: MessageAnalysis;
  style: UserStyle;
}): ResponsePlan {
  const { text, messageType = "text", recent, analysis, style } = options;
  const lower = text.trim().toLowerCase();
  const typos = expandTypos(text);
  const incomplete = isIncompleteFollowup(text, recent);
  const media = mediaAction(messageType);
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

  let action: ConversationalAction = "answer";
  let draft: string | undefined;
  let confidence = 0.72;
  let complexity = analysis.complexity === "simple" ? 0.12 : analysis.complexity === "normal" ? 0.35 : analysis.complexity === "multi" ? 0.62 : 0.84;

  if (analysis.intents.includes("handoff")) {
    action = "escalate";
    draft = "theek, thoda wait, dekh ke likhta hoon";
    confidence = 0.95;
  } else if (media && (lower === "[image]" || lower === "[voice]" || lower === "[video]" || lower === "[document]")) {
    action = "ask";
    draft =
      messageType === "audio"
        ? "sununga. urgent ho to text bhi maar dena"
        : messageType === "document"
          ? "file mil gayi. context ek line mein de dena"
          : "pic/file aa gayi. text mein likh do kya dekhna hai";
    confidence = 0.9;
    complexity = 0.2;
  } else if (ACK.test(text.trim()) || (analysis.intents.includes("thanks") && wordCount <= 6)) {
    action = "acknowledge";
    draft = ACK.test(text.trim()) ? "ok" : style.usesSlang ? "koi baat nahi bro" : "koi baat nahi";
    confidence = 0.93;
    complexity = 0.05;
  } else if (analysis.complexity === "simple" && analysis.intents[0] === "greeting" && !analysis.wantsAllAnswers) {
    action = "acknowledge";
    draft = style.usesSlang ? "haan bro, bolo" : "haan, kya haal hai";
    confidence = 0.94;
    complexity = 0.08;
  } else if (incomplete) {
    action = "clarify";
    if (/^(kal|tomorrow)\??$/i.test(text.trim()) && !recent.length) {
      draft = "maaf, kal kis cheez ke liye — call, kaam, ya kuch aur?";
    } else {
      const lastUser = [...recent].reverse().find((row) => row.role === "user")?.text ?? "pehle wali baat";
      draft = `pehle wali baat confirm kar dun — ${lastUser.slice(0, 42).replace(/\n/g, " ")}?`;
    }
    confidence = 0.66;
    complexity = 0.28;
  } else if (analysis.intents.includes("project") && !analysis.intents.includes("process") && wordCount < 12) {
    action = "ask";
    draft = "haan, bata kya soch rahe ho";
    confidence = 0.7;
    complexity = 0.4;
  } else if (analysis.wantsAllAnswers || analysis.complexity === "lead") {
    action = "answer";
    confidence = 0.58;
  }

  const requiresKnowledge = analysis.topics.some((topic) =>
    ["pricing", "website", "studio", "services", "process", "portfolio"].includes(topic),
  );
  const requiresReasoning = analysis.wantsAllAnswers || analysis.complexity === "lead" || analysis.complexity === "multi";

  return {
    action,
    intent: [...new Set([...analysis.intents, ...typos])].join(",") || "general",
    goal: action === "clarify" ? "resolve_reference" : action === "ask" ? "listen" : "talk_as_self",
    tone: style.formality === "low" ? "casual" : "calm",
    language: style.language,
    answerLength: analysis.preferredStyle === "complete" ? "complete" : "short",
    needsQuestion: action === "ask" || action === "clarify",
    needsClarification: action === "clarify",
    confidence,
    complexity,
    requiresKnowledge,
    requiresReasoning,
    requiresVision: messageType === "image" || messageType === "video",
    requiresAudio: messageType === "audio",
    urgency: analysis.urgency === "high" ? 0.8 : 0.2,
    draft,
    summary: conversationSummary(recent),
  };
}

export function analyzeTurn(
  text: string,
  recent: Array<{ role: "user" | "assistant"; text: string }>,
  isFirstMessage: boolean,
) {
  const analysis = analyzeMessage(text, { isFirstMessage, inboundCount: recent.filter((row) => row.role === "user").length + 1 });
  const style = inferUserStyle(text, recent);
  const plan = planTurn({ text, recent, analysis, style });
  return { analysis, style, plan };
}
