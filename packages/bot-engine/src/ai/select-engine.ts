import type { MessageAnalysis } from "./analyze.ts";
import { isUnhealthy, providerScore } from "../orchestrate/health.ts";
import type { ResponsePlan } from "../orchestrate/types.ts";

export type ReplyEngineId =
  | "gpt-4o"
  | "gpt-4o-mini"
  | "claude"
  | "groq"
  | "gemini"
  | "openrouter"
  | "together"
  | "cerebras"
  | "openai-compatible";

export type EnginePlan = {
  engine: ReplyEngineId;
  model: string;
  maxTokens: number;
  temperature: number;
  reason: string;
  tier: 1 | 2 | 3;
};

export type AiPolicy = "free-first" | "quality" | "hybrid";

export function aiPolicy(): AiPolicy {
  const raw = (process.env.AI_POLICY || "hybrid").toLowerCase();
  if (raw === "free-first" || raw === "quality" || raw === "hybrid") return raw;
  return "hybrid";
}

export function availableEngines(): ReplyEngineId[] {
  const ids: ReplyEngineId[] = [];
  if (process.env.GROQ_API_KEY) ids.push("groq");
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY) ids.push("gemini");
  if (process.env.CEREBRAS_API_KEY) ids.push("cerebras");
  if (process.env.TOGETHER_API_KEY) ids.push("together");
  if (process.env.OPENROUTER_API_KEY) ids.push("openrouter");
  if (process.env.OPENAI_API_KEY) ids.push("gpt-4o-mini", "gpt-4o");
  if (process.env.ANTHROPIC_API_KEY) ids.push("claude");
  if (process.env.OPENAI_COMPATIBLE_BASE_URL) ids.push("openai-compatible");
  return ids;
}

function tokenBudget(analysis: MessageAnalysis, plan?: ResponsePlan) {
  if (plan?.action === "acknowledge" || analysis.complexity === "simple") return 80;
  if (analysis.preferredStyle === "complete" || analysis.complexity === "lead" || analysis.complexity === "multi") return 420;
  return 160;
}

const MODELS = {
  openai: () => process.env.OPENAI_MODEL || "gpt-4o",
  mini: () => process.env.OPENAI_MINI_MODEL || "gpt-4o-mini",
  claude: () => process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
  groq: () => process.env.GROQ_MODEL || "qwen/qwen3.8-27b",
  gemini: () => process.env.GEMINI_MODEL || "gemini-2.0-flash",
  router: () => process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
  together: () => process.env.TOGETHER_MODEL || "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  cerebras: () => process.env.CEREBRAS_MODEL || "llama-3.3-70b",
  compat: () => process.env.OPENAI_COMPATIBLE_MODEL || "local",
};

const PROFILE: Record<ReplyEngineId, { quality: number; speed: number; cost: number; reasoning: number; tier: 1 | 2 | 3 }> = {
  groq: { quality: 0.78, speed: 0.96, cost: 0.08, reasoning: 0.7, tier: 1 },
  gemini: { quality: 0.82, speed: 0.9, cost: 0.1, reasoning: 0.74, tier: 1 },
  cerebras: { quality: 0.76, speed: 0.97, cost: 0.08, reasoning: 0.68, tier: 1 },
  together: { quality: 0.8, speed: 0.88, cost: 0.12, reasoning: 0.72, tier: 1 },
  "gpt-4o-mini": { quality: 0.84, speed: 0.86, cost: 0.22, reasoning: 0.78, tier: 2 },
  openrouter: { quality: 0.8, speed: 0.8, cost: 0.2, reasoning: 0.75, tier: 2 },
  "openai-compatible": { quality: 0.7, speed: 0.7, cost: 0.05, reasoning: 0.6, tier: 1 },
  claude: { quality: 0.93, speed: 0.72, cost: 0.45, reasoning: 0.92, tier: 3 },
  "gpt-4o": { quality: 0.95, speed: 0.7, cost: 0.55, reasoning: 0.94, tier: 3 },
};

function envOrder(): ReplyEngineId[] | null {
  const raw = process.env.AI_PROVIDER_ORDER?.trim();
  if (!raw) return null;
  return raw
    .split(/[,\s]+/)
    .map((id) => id.trim() as ReplyEngineId)
    .filter(Boolean);
}

export function planReplyEngines(analysis: MessageAnalysis, turn?: ResponsePlan): EnginePlan[] {
  const have = new Set(availableEngines());
  const policy = aiPolicy();
  const maxTokens = tokenBudget(analysis, turn);
  const temperature = analysis.wantsAllAnswers || turn?.requiresReasoning ? 0.52 : 0.68;
  const strong = Boolean(
    turn?.requiresReasoning ||
      turn?.confidence && turn.confidence < 0.62 ||
      analysis.complexity === "lead" ||
      analysis.wantsAllAnswers ||
      policy === "quality",
  );

  const catalog: Array<{ engine: ReplyEngineId; model: string; reason: string }> = [
    { engine: "groq", model: MODELS.groq(), reason: "tier1 free/fast" },
    { engine: "gemini", model: MODELS.gemini(), reason: "tier1 gemini flash" },
    { engine: "cerebras", model: MODELS.cerebras(), reason: "tier1 cerebras" },
    { engine: "together", model: MODELS.together(), reason: "tier1 together" },
    { engine: "openai-compatible", model: MODELS.compat(), reason: "local/compatible" },
    { engine: "gpt-4o-mini", model: MODELS.mini(), reason: "tier2 mini" },
    { engine: "openrouter", model: MODELS.router(), reason: "tier2 router" },
    { engine: "claude", model: MODELS.claude(), reason: "tier3 claude" },
    { engine: "gpt-4o", model: MODELS.openai(), reason: "tier3 gpt-4o" },
  ];

  const preferred = envOrder();
  let ordered = catalog.filter((row) => have.has(row.engine) && !isUnhealthy(row.engine));
  if (preferred) {
    ordered.sort((a, b) => {
      const ia = preferred.indexOf(a.engine);
      const ib = preferred.indexOf(b.engine);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  } else if (policy === "quality") {
    ordered.sort((a, b) => PROFILE[b.engine].quality - PROFILE[a.engine].quality);
  } else if (policy === "free-first" || !strong) {
    ordered.sort((a, b) => PROFILE[a.engine].tier - PROFILE[b.engine].tier || providerScore(b.engine, PROFILE[b.engine]) - providerScore(a.engine, PROFILE[a.engine]));
  } else {
    // hybrid + hard problem: strongest first, then cheap fallbacks
    ordered.sort((a, b) => PROFILE[b.engine].reasoning - PROFILE[a.engine].reasoning);
  }

  const seen = new Set<ReplyEngineId>();
  const plans: EnginePlan[] = [];
  for (const row of ordered) {
    if (seen.has(row.engine)) continue;
    seen.add(row.engine);
    plans.push({
      ...row,
      maxTokens,
      temperature,
      tier: PROFILE[row.engine].tier,
    });
  }
  return plans;
}
