import type { MessageAnalysis, MessageIntent } from "./analyze.ts";

const TOPIC_SIGNALS: Partial<Record<MessageIntent, RegExp>> = {
  identity: /\b(tarik|main hoon|main tarik)\b/i,
  services: /\b(forensic|security|ai|product|studio|kaam)\b/i,
  website: /\btarikislam\.in\b/i,
  studio: /\bdezo\b/i,
  pricing: /\b(rate|andaz|price)\b/i,
  availability: /\b(dekh ke likhta|available|jaldi)\b/i,
  process: /\b(pehle sunta|jo clear|phir jo clear)\b/i,
  timeline: /\b(date andaz|andaz se nahi ghad|timeline)\b/i,
  meeting: /\b(time bhej|confirm|call|meet)\b/i,
  hours: /\b(yahin hota|din mein|ist|24 ghante|24 hours)\b/i,
  location: /\b(bhubaneswar|india)\b/i,
  portfolio: /\b(portfolio|tarikislam\.in)\b/i,
  contact: /\b(gmail|89844|instagram|github)\b/i,
  credentials: /\b(b\.sc|m\.sc|mca|m\.tech|ceh|chfi|oscp|tarikislam\.in)\b/i,
  forensics: /\b(forensic|evidence)\b/i,
  security: /\b(security|cyber)\b/i,
  "ai-work": /\b(ai systems|ai pe kaam)\b/i,
  project: /\b(bataiye kya soch|bata kya soch|soch hai|soch rahe|sun raha)\b/i,
  greeting: /\b(hey|haan|hello|salam|bolo|kya ho raha|kya haal)\b/i,
};

const ASK_SIGNALS: Array<{ match: RegExp; covered: RegExp; topic?: MessageIntent }> = [
  { match: /rate|price|kitna|quote/i, covered: /\b(rate|andaz)\b/i, topic: "pricing" },
  { match: /kaam kaise|process/i, covered: /\b(pehle sunta|jo clear)\b/i, topic: "process" },
  { match: /portfolio/i, covered: /\b(portfolio|tarikislam\.in)\b/i, topic: "portfolio" },
  { match: /site kahan|website kahan|tarikislam/i, covered: /\btarikislam\.in\b/i, topic: "website" },
  { match: /dezo/i, covered: /\bdezo\b/i, topic: "studio" },
  { match: /time hai|available/i, covered: /\b(dekh ke likhta|available|jaldi|q3)\b/i, topic: "availability" },
  { match: /kitna time|timeline/i, covered: /\b(date andaz|andaz se nahi ghad)\b/i, topic: "timeline" },
  { match: /email|gmail|contact|number/i, covered: /\b(gmail|89844|instagram)\b/i, topic: "contact" },
  { match: /resume|cv|degree|credential/i, covered: /\b(b\.sc|mca|ceh|oscp|tarikislam\.in)\b/i, topic: "credentials" },
  { match: /call|meet/i, covered: /\b(time bhej|confirm|call|meet)\b/i, topic: "meeting" },
  { match: /yahin rehta|hours|timing/i, covered: /\b(yahin|din mein|ist|24)\b/i, topic: "hours" },
  { match: /kahan se kaam/i, covered: /\b(bhubaneswar|india)\b/i, topic: "location" },
  { match: /kaun hoon|who/i, covered: /\btarik\b/i, topic: "identity" },
  { match: /kya karta|services/i, covered: /\b(forensic|security|product)\b/i, topic: "services" },
  { match: /forensic/i, covered: /\bforensic/i, topic: "forensics" },
  { match: /security/i, covered: /\b(security|cyber)\b/i, topic: "security" },
  { match: /kya banana|soch rahe/i, covered: /\b(bata|soch|sun raha)\b/i, topic: "project" },
];

export function topicCovered(text: string, topic: MessageIntent): boolean {
  const pattern = TOPIC_SIGNALS[topic];
  return pattern ? pattern.test(text) : true;
}

export function askCovered(text: string, ask: string): boolean {
  const row = ASK_SIGNALS.find((item) => item.match.test(ask));
  if (row) return row.covered.test(text);
  return text.trim().length > 8;
}

export function missedTopics(text: string, analysis: MessageAnalysis): MessageIntent[] {
  return analysis.topics.filter((topic) => {
    if (topic === "urgent" || topic === "general" || topic === "smalltalk" || topic === "greeting" || topic === "thanks") {
      return false;
    }
    return !topicCovered(text, topic);
  });
}

export function missedAsks(text: string, analysis: MessageAnalysis): string[] {
  const asks = analysis.asks.length > 1 ? analysis.asks : analysis.questions.length > 1 ? analysis.questions : [];
  const fromAsks = asks.filter((ask) => !askCovered(text, ask));
  const fromTopics = missedTopics(text, analysis).map((topic) => topic);
  const merged = [...fromAsks];
  for (const topic of fromTopics) {
    if (!merged.some((ask) => ASK_SIGNALS.some((row) => row.topic === topic && row.match.test(ask)))) {
      merged.push(topic);
    }
  }
  return [...new Set(merged)];
}

export function scoreReplyCompleteness(text: string, analysis: MessageAnalysis): number {
  const check = analysis.topics.filter(
    (topic) => topic !== "urgent" && topic !== "general" && topic !== "smalltalk" && topic !== "greeting" && topic !== "thanks",
  );
  if (!check.length && !(analysis.asks.length > 1)) return text.trim().length > 0 ? 1 : 0;
  const topicHits = check.length ? check.filter((topic) => topicCovered(text, topic)).length / check.length : 1;
  const askList = analysis.asks.length > 1 ? analysis.asks : analysis.questions;
  const askHits =
    askList.length <= 1 ? 1 : askList.filter((ask) => askCovered(text, ask)).length / askList.length;
  const spoken = /\b(main|haan|nahi|dekh|likh|bolo|theek|tarik|andaz|soch)\b/i.test(text) || text.split(/\n/).length >= 2 ? 1 : 0.85;
  return topicHits * 0.55 + askHits * 0.3 + spoken * 0.15;
}
