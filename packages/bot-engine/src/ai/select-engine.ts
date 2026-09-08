import type { MessageAnalysis } from "./analyze.ts";

export type ReplyEngineId = "gpt-4o" | "gpt-4o-mini" | "claude" | "groq" | "openrouter" | "openai-compatible";

export type EnginePlan = {
  engine: ReplyEngineId;
  model: string;
  maxTokens: number;
  temperature: number;
  reason: string;
};

export function availableEngines(): ReplyEngineId[] {
  const ids: ReplyEngineId[] = [];
  if (process.env.OPENAI_API_KEY) {
    ids.push("gpt-4o", "gpt-4o-mini");
  }
  if (process.env.ANTHROPIC_API_KEY) ids.push("claude");
  if (process.env.GROQ_API_KEY) ids.push("groq");
  if (process.env.OPENROUTER_API_KEY) ids.push("openrouter");
  if (process.env.OPENAI_COMPATIBLE_BASE_URL) ids.push("openai-compatible");
  return ids;
}

function tokenBudget(analysis: MessageAnalysis) {
  if (analysis.complexity === "simple") return 80;
  if (analysis.preferredStyle === "complete") return 420;
  if (analysis.complexity === "lead" || analysis.complexity === "multi") return 420;
  return 160;
}

function tempFor(analysis: MessageAnalysis) {
  if (analysis.complexity === "lead" || analysis.wantsAllAnswers) return 0.4;
  if (analysis.complexity === "simple") return 0.6;
  return 0.5;
}

/** Rank engines for this message. First item is the best available choice. */
export function planReplyEngines(analysis: MessageAnalysis): EnginePlan[] {
  const have = new Set(availableEngines());
  const maxTokens = tokenBudget(analysis);
  const temperature = tempFor(analysis);
  const ranked: Array<{ engine: ReplyEngineId; model: string; reason: string }> = [];

  const openaiModel = process.env.OPENAI_MODEL || "gpt-4o";
  const miniModel = process.env.OPENAI_MINI_MODEL || "gpt-4o-mini";
  const claudeModel = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
  const groqModel = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  const routerModel = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
  const compatModel = process.env.OPENAI_COMPATIBLE_MODEL || "local";

  if (analysis.complexity === "simple" && !analysis.isFirstMessage) {
    ranked.push(
      { engine: "groq", model: groqModel, reason: "fast ack" },
      { engine: "gpt-4o-mini", model: miniModel, reason: "cheap short chat" },
      { engine: "gpt-4o", model: openaiModel, reason: "quality fallback" },
    );
  } else if (analysis.complexity === "lead" || analysis.wantsAllAnswers) {
    ranked.push(
      { engine: "gpt-4o", model: openaiModel, reason: "best complete first-message answers" },
      { engine: "claude", model: claudeModel, reason: "warm complete reply" },
      { engine: "groq", model: groqModel, reason: "strong open model fallback" },
      { engine: "gpt-4o-mini", model: miniModel, reason: "still covers the checklist" },
    );
  } else if (analysis.language === "english" && analysis.topics.includes("identity")) {
    ranked.push(
      { engine: "claude", model: claudeModel, reason: "natural first-person English" },
      { engine: "gpt-4o", model: openaiModel, reason: "reliable voice" },
      { engine: "groq", model: groqModel, reason: "fallback" },
    );
  } else {
    ranked.push(
      { engine: "gpt-4o", model: openaiModel, reason: "best Hinglish person-voice" },
      { engine: "groq", model: groqModel, reason: "fast Hinglish" },
      { engine: "claude", model: claudeModel, reason: "human tone" },
      { engine: "gpt-4o-mini", model: miniModel, reason: "backup" },
    );
  }

  ranked.push(
    { engine: "openrouter", model: routerModel, reason: "router backup" },
    { engine: "openai-compatible", model: compatModel, reason: "local/compatible backup" },
  );

  const seen = new Set<ReplyEngineId>();
  const plans: EnginePlan[] = [];
  for (const row of ranked) {
    if (!have.has(row.engine) || seen.has(row.engine)) continue;
    seen.add(row.engine);
    plans.push({ ...row, maxTokens, temperature });
  }
  return plans;
}
