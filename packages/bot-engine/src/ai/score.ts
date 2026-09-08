import type { MessageAnalysis, MessageIntent } from "./analyze.ts";

const TOPIC_SIGNALS: Partial<Record<MessageIntent, RegExp>> = {
  identity: /\b(tarik|main hoon|main tarik)\b/i,
  services: /\b(forensic|security|ai|product|studio|kaam)\b/i,
  website: /\b(tarikislam\.in|website|site)\b/i,
  studio: /\b(dezo)\b/i,
  pricing: /\b(rate|scope|number|quote|andaz|price|budget)\b/i,
  availability: /\b(le sakta|available|24h|haan)\b/i,
  process: /\b(pehle|brief|scope|approach|step|process)\b/i,
  timeline: /\b(timeline|scope|din|depend)\b/i,
  meeting: /\b(call|time|meet|zoom)\b/i,
  hours: /\b(din|yahin|note|hour|timing)\b/i,
  location: /\b(india|meet)\b/i,
  portfolio: /\b(portfolio|sealed|site|dekh)\b/i,
  forensics: /\b(forensic|evidence)\b/i,
  security: /\b(security|cyber)\b/i,
  "ai-work": /\b(ai|rag|agent)\b/i,
  project: /\b(brief|banana|scope|kya)\b/i,
  greeting: /\b(hey|haan|hello|salam|bolo|kya ho raha)\b/i,
};

export function scoreReplyCompleteness(text: string, analysis: MessageAnalysis): number {
  const check = analysis.topics.filter((topic) => topic !== "urgent" && topic !== "general" && topic !== "smalltalk");
  if (!check.length) return text.trim().length > 0 ? 1 : 0;
  let hits = 0;
  for (const topic of check) {
    const pattern = TOPIC_SIGNALS[topic];
    if (!pattern || pattern.test(text)) hits += 1;
  }
  const questionCover =
    analysis.questions.length <= 1
      ? 1
      : Math.min(1, text.split(/\n|[.!?]/).filter((line) => line.trim().length > 12).length / analysis.questions.length);
  const topicScore = hits / check.length;
  return topicScore * 0.7 + questionCover * 0.3;
}

export function missedTopics(text: string, analysis: MessageAnalysis): MessageIntent[] {
  return analysis.topics.filter((topic) => {
    if (topic === "urgent" || topic === "general" || topic === "smalltalk") return false;
    const pattern = TOPIC_SIGNALS[topic];
    return pattern ? !pattern.test(text) : false;
  });
}
