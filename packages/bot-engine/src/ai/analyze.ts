export type MessageIntent =
  | "greeting"
  | "identity"
  | "services"
  | "website"
  | "studio"
  | "pricing"
  | "availability"
  | "process"
  | "timeline"
  | "meeting"
  | "hours"
  | "location"
  | "handoff"
  | "thanks"
  | "forensics"
  | "security"
  | "ai-work"
  | "portfolio"
  | "urgent"
  | "project"
  | "smalltalk"
  | "general";

export type MessageAnalysis = {
  isFirstMessage: boolean;
  language: "hinglish" | "english" | "hindi";
  complexity: "simple" | "normal" | "multi" | "lead";
  intents: MessageIntent[];
  questions: string[];
  topics: MessageIntent[];
  wantsAllAnswers: boolean;
  urgency: "low" | "normal" | "high";
  preferredStyle: "short" | "complete";
};

const INTENT_PATTERNS: Array<{ intent: MessageIntent; pattern: RegExp }> = [
  { intent: "greeting", pattern: /\b(hi|hii|hello|hey|yo|hola|namaste|namaskar|salam|salaam|assalam|kaise ho|kya haal|whats?up|good morning|gm)\b/i },
  { intent: "thanks", pattern: /\b(thank|thanks|thx|shukriya|dhanyavaad)\b/i },
  { intent: "handoff", pattern: /\b(agent|human|person|staff|talk to (a )?human)\b/i },
  { intent: "identity", pattern: /\b(who are you|your name|aap kaun|tum kaun|kaun ho|introduce)\b/i },
  { intent: "services", pattern: /\b(what do you do|kya karte|kaam kya|services?|offer)\b/i },
  { intent: "website", pattern: /\b(website|site|web ?site|link|url|tarikislam)\b/i },
  { intent: "portfolio", pattern: /\b(portfolio|work samples?|case stud|previous work|examples?)\b/i },
  { intent: "studio", pattern: /\b(dezo|studio)\b/i },
  { intent: "pricing", pattern: /\b(price|pricing|cost|rate|fees?|charge|budget|kitna|daam|quote|estimate)\b/i },
  { intent: "availability", pattern: /\b(available|availability|hire|hiring|freelance|engage|slot|bandwidth)\b/i },
  { intent: "process", pattern: /\b(process|kaise start|how (do|does|to) (we |you )?(start|work)|steps?|workflow|approach)\b/i },
  { intent: "timeline", pattern: /\b(timeline|kitne din|how long|deadline|delivery|turnaround|kab tak)\b/i },
  { intent: "meeting", pattern: /\b(call|phone|zoom|meet|meeting|video|milna|baat kar)\b/i },
  { intent: "hours", pattern: /\b(hours?|timing|open|close|kitne baje|office time)\b/i },
  { intent: "location", pattern: /\b(where|location|address|kahan|kidhar|based)\b/i },
  { intent: "forensics", pattern: /\b(forensic|evidence|malware|incident)\b/i },
  { intent: "security", pattern: /\b(cyber|security|audit|pentest|secure)\b/i },
  { intent: "ai-work", pattern: /\b(ai|llm|rag|agent|automation|saas|gpt)\b/i },
  { intent: "urgent", pattern: /\b(urgent|jaldi|asap|emergency|abhi)\b/i },
  { intent: "project", pattern: /\b(project|banana hai|build|website banana|app|product|mvp)\b/i },
];

const HINGLISH_MARKERS =
  /\b(kya|hai|haan|nahi|chahiye|bolo|kaam|thoda|mujhe|aap|tum|kaise|kitna|andaz|dekh|likh|bhej|scene)\b/i;

export function splitAsks(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const numbered = trimmed
    .split(/\n+|(?=\b\d+[.)]\s)/)
    .map((part) => part.replace(/^\d+[.)]\s*/, "").trim())
    .filter((part) => part.length > 8);
  if (numbered.length > 1) return numbered;

  const byQuestion = trimmed
    .split(/(?<=[?؟])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (byQuestion.length > 1) return byQuestion;

  const byAnd = trimmed
    .split(/\s+(?:aur|and|also|plus)\s+/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 12);
  if (byAnd.length > 1) return byAnd;

  return [trimmed];
}

function detectLanguage(text: string): MessageAnalysis["language"] {
  if (/[\u0900-\u097F]/.test(text) && HINGLISH_MARKERS.test(text)) return "hinglish";
  if (/[\u0900-\u097F]/.test(text)) return "hindi";
  if (HINGLISH_MARKERS.test(text)) return "hinglish";
  return "english";
}

export function analyzeMessage(
  text: string,
  options: { isFirstMessage?: boolean; inboundCount?: number } = {},
): MessageAnalysis {
  const body = text.trim();
  const isFirstMessage = options.isFirstMessage ?? (options.inboundCount ?? 0) <= 1;
  const questions = splitAsks(body);
  const intents = INTENT_PATTERNS.filter((row) => row.pattern.test(body)).map((row) => row.intent);
  const unique = [...new Set(intents.length ? intents : (["general"] as MessageIntent[]))];
  const topics = unique.filter((intent) => intent !== "greeting" && intent !== "thanks" && intent !== "smalltalk");
  const urgency = unique.includes("urgent") ? "high" : "normal";
  const wordCount = body.split(/\s+/).filter(Boolean).length;
  const multi = questions.length > 1 || topics.length > 1;
  const lead = Boolean(
    unique.includes("project") ||
      unique.includes("pricing") ||
      unique.includes("process") ||
      unique.includes("availability") ||
      (isFirstMessage && multi),
  );
  let complexity: MessageAnalysis["complexity"] = "normal";
  if (wordCount <= 4 && unique.length <= 1 && (unique[0] === "greeting" || unique[0] === "thanks")) {
    complexity = "simple";
  } else if (lead && multi) complexity = "lead";
  else if (multi) complexity = "multi";

  const wantsAllAnswers = complexity === "multi" || complexity === "lead" || questions.length > 1 || topics.length > 1;

  return {
    isFirstMessage,
    language: detectLanguage(body),
    complexity,
    intents: unique,
    questions,
    topics: topics.length ? topics : unique,
    wantsAllAnswers,
    urgency,
    preferredStyle: wantsAllAnswers || (isFirstMessage && wordCount > 8) ? "complete" : "short",
  };
}

export function detectIntent(text: string): string {
  return analyzeMessage(text).intents[0] ?? "general";
}
