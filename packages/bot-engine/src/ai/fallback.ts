import type { MessageAnalysis } from "./analyze.ts";
import { TARIK_PUBLIC_FACTS } from "./facts.ts";

const LINE_FOR: Record<string, string> = {
  greeting: "hey, sun raha hoon",
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
  forensics: TARIK_PUBLIC_FACTS.forensics,
  security: TARIK_PUBLIC_FACTS.security,
  "ai-work": TARIK_PUBLIC_FACTS["ai-work"],
  project: TARIK_PUBLIC_FACTS.project,
};

export function writeCompleteFallback(analysis: MessageAnalysis, extraFacts: string[] = []): string {
  if (analysis.complexity === "simple" && analysis.intents[0] === "greeting") {
    return "hey, kya ho raha hai";
  }
  if (analysis.complexity === "simple" && analysis.intents[0] === "thanks") {
    return "all good";
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
    lines.push("kya banana hai, kis ke liye, kab tak — yeh 3 lines likh de, uske baad clear number dunga");
  }

  if (!lines.length) return "haan, dekh liya. thoda aur bata — kya banana hai, kab tak, kis ke liye";
  return lines.slice(0, 8).join("\n");
}
