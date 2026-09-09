import type { MessageAnalysis } from "./analyze.ts";
import { TARIK_PUBLIC_FACTS } from "./facts.ts";
import { writeSpokenReply } from "../orchestrate/spoken.ts";

const LINE_FOR: Record<string, string> = {
  greeting: "ji, sun raha hoon",
  identity: TARIK_PUBLIC_FACTS.identity,
  services: TARIK_PUBLIC_FACTS.services,
  website: TARIK_PUBLIC_FACTS.website,
  portfolio: TARIK_PUBLIC_FACTS.portfolio,
  studio: TARIK_PUBLIC_FACTS.studio,
  pricing: TARIK_PUBLIC_FACTS.pricing,
  availability: TARIK_PUBLIC_FACTS.availability,
  process: TARIK_PUBLIC_FACTS.process,
  timeline: TARIK_PUBLIC_FACTS.timeline,
  meeting: TARIK_PUBLIC_FACTS.meeting,
  hours: TARIK_PUBLIC_FACTS.hours,
  location: TARIK_PUBLIC_FACTS.location,
  contact: TARIK_PUBLIC_FACTS.contact,
  email: TARIK_PUBLIC_FACTS.email,
  credentials: TARIK_PUBLIC_FACTS.credentials,
  forensics: TARIK_PUBLIC_FACTS.forensics,
  security: TARIK_PUBLIC_FACTS.security,
  "ai-work": TARIK_PUBLIC_FACTS["ai-work"],
  project: TARIK_PUBLIC_FACTS.project,
};

export function writeCompleteFallback(
  analysis: MessageAnalysis,
  extraFacts: string[] = [],
  incoming = "",
): string {
  if (analysis.complexity === "simple" && analysis.intents[0] === "greeting") {
    return "namaste, kya haal hai";
  }
  if (analysis.complexity === "simple" && analysis.intents[0] === "thanks") {
    return "shukriya, koi baat nahi";
  }

  const spoken = writeSpokenReply(incoming || analysis.asks.join(" ") || analysis.meaning, analysis);
  if (spoken && analysis.topics.filter((t) => t !== "greeting").length <= 1) {
    return spoken;
  }
  if (spoken && analysis.preferredStyle === "complete" && spoken.split("\n").length >= 2) {
    return spoken;
  }

  const lines: string[] = [];
  if (analysis.isFirstMessage && analysis.intents.includes("greeting") && !analysis.wantsAllAnswers) {
    lines.push(LINE_FOR.greeting);
  }

  const order = analysis.topics.length ? analysis.topics : analysis.intents;
  for (const intent of order) {
    const fact = LINE_FOR[intent];
    if (!fact) continue;
    if (intent === "greeting" || (intent === "location" && !analysis.topics.includes("location"))) continue;
    if (!lines.some((line) => line === fact)) lines.push(fact);
  }

  for (const extra of extraFacts.slice(0, 2)) {
    const bit = extra.replace(/^[^:]+:\s*/, "").trim();
    if (bit && bit.length < 110 && !lines.includes(bit) && !/on behalf|assistant/i.test(bit)) {
      lines.push(bit);
    }
  }

  if (analysis.wantsAllAnswers) {
    lines.push("jo clear nahi, uspe andaz nahi");
  }

  if (!lines.length) {
    return writeSpokenReply(incoming || analysis.asks.join(" ") || analysis.meaning, analysis);
  }
  return lines.slice(0, 8).join("\n");
}

export function factLineForTopic(topic: string): string | undefined {
  return LINE_FOR[topic] ?? TARIK_PUBLIC_FACTS[topic];
}

const ASK_TOPIC: Array<{ match: RegExp; topic: string }> = [
  { match: /rate|price|kitna|quote/i, topic: "pricing" },
  { match: /kaam kaise|process/i, topic: "process" },
  { match: /portfolio/i, topic: "portfolio" },
  { match: /site kahan|website kahan|tarikislam/i, topic: "website" },
  { match: /dezo/i, topic: "studio" },
  { match: /time hai|available/i, topic: "availability" },
  { match: /kitna time|timeline/i, topic: "timeline" },
  { match: /call|meet/i, topic: "meeting" },
  { match: /yahin rehta|hours|timing|ist|24/i, topic: "hours" },
  { match: /kahan se kaam|kidhar|bhubaneswar|where are you/i, topic: "location" },
  { match: /email|gmail|contact|number|instagram|github/i, topic: "contact" },
  { match: /resume|cv|degree|ceh|oscp|credential/i, topic: "credentials" },
  { match: /kaun hoon|who/i, topic: "identity" },
  { match: /kya karta|services/i, topic: "services" },
  { match: /forensic/i, topic: "forensics" },
  { match: /security/i, topic: "security" },
  { match: /kya banana|soch rahe/i, topic: "project" },
];

export function stitchMissingAsks(text: string, analysis: MessageAnalysis, missed: string[]): string {
  if (!missed.length) return text;
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const item of missed) {
    const mapped = ASK_TOPIC.find((row) => row.match.test(item));
    const topic = mapped?.topic ?? item;
    const fact = factLineForTopic(topic);
    if (!fact) continue;
    if (lines.some((line) => line.toLowerCase() === fact.toLowerCase() || line.includes(fact.slice(0, 18)))) continue;
    lines.push(fact);
    if (lines.length >= 6) break;
  }
  return lines.join("\n");
}
