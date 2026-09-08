import type { BotSettings, NormalizedMessage } from "@bot/shared";
import { analyzeMessage, type MessageAnalysis } from "./analyze.ts";
import { writeCompleteFallback } from "./fallback.ts";
import { factsForIntents } from "./facts.ts";
import { missedTopics, scoreReplyCompleteness } from "./score.ts";
import { planReplyEngines, type EnginePlan, type ReplyEngineId } from "./select-engine.ts";

export type { MessageAnalysis } from "./analyze.ts";
export { analyzeMessage, detectIntent, splitAsks } from "./analyze.ts";
export { planReplyEngines, availableEngines } from "./select-engine.ts";
export { writeCompleteFallback } from "./fallback.ts";
export { scoreReplyCompleteness } from "./score.ts";

export type AiContext = {
  settings: BotSettings;
  customerName: string;
  recent: Array<{ role: "user" | "assistant"; text: string }>;
  faqs: string[];
  knowledge: string[];
  intent?: string;
  suggested?: string;
  analysis?: MessageAnalysis;
  isFirstMessage?: boolean;
};

const HUMAN_SYSTEM = [
  "You are Tarik Islam, a real person, texting on WhatsApp in first person.",
  "Never sound like a bot, CRM, or assistant. Do not mention AI, models, or automation.",
  "Do not invent prices, fake case results, unpublished credentials, or that a human already replied.",
  "If they asked more than one thing, answer every ask. Do not hide behind a single website line.",
  "Unknown numbers stay unknown: say you quote after scope, then still answer the other parts.",
  "No brochure, no stacked job titles, no 'How can I help you today', no 'Thanks for reaching out'.",
].join(" ");

function isBadAiText(text: string, allowLong: boolean) {
  if (!text) return true;
  if (text.length > (allowLong ? 900 : 320)) return true;
  return /as an ai|language model|how can i help you today|thanks for reaching out|on behalf of|system prompt|api key/i.test(
    text,
  );
}

export function buildPrompt(message: NormalizedMessage, ctx: AiContext) {
  const inbound = ctx.recent.filter((row) => row.role === "user").length;
  const analysis =
    ctx.analysis ??
    analyzeMessage(message.text, {
      isFirstMessage: ctx.isFirstMessage ?? inbound <= 1,
      inboundCount: inbound + 1,
    });
  const history = ctx.recent
    .slice(-8)
    .map((m) => `${m.role}: ${m.text}`)
    .join("\n");
  const facts = factsForIntents(analysis.topics, [...ctx.faqs, ...ctx.knowledge, ctx.suggested ?? ""]);
  const checklist = (analysis.questions.length > 1 ? analysis.questions : analysis.topics)
    .map((item, index) => `${index + 1}. ${item}`)
    .join("\n");
  const style =
    analysis.preferredStyle === "complete"
      ? [
          "Write 3–7 short WhatsApp lines.",
          "If they greeted, one soft greeting then answers — do not only greet.",
          "Cover every item in the checklist. One line per ask is fine.",
          "Calm Hinglish unless they wrote pure English; then match them.",
        ].join(" ")
      : "1–2 short lines. Calm Hinglish (Hindi + English mix). lowercase is fine. Reply to what they actually said.";

  const extra = [
    `This is ${analysis.isFirstMessage ? "their FIRST message" : "a follow-up"}. Complexity: ${analysis.complexity}. Language: ${analysis.language}.`,
    `Intents: ${analysis.intents.join(", ")}.`,
    checklist ? `You MUST answer all of these:\n${checklist}` : "",
    facts.length ? `True facts you may use (rephrase like a person, do not dump):\n${facts.map((f) => `- ${f}`).join("\n")}` : "",
    ctx.intent ? `Router hint: ${ctx.intent}.` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    system: [HUMAN_SYSTEM, style, `Preferred language: ${ctx.settings.defaultLanguage}.`, extra].join("\n"),
    user: `${history}\nuser (${ctx.customerName}): ${message.text}`.trim(),
    analysis,
  };
}

type ProviderHit = { text: string; engine: string };

async function openAiCompatible(options: {
  url: string;
  key?: string;
  model: string;
  system: string;
  user: string;
  engine: string;
  maxTokens: number;
  temperature: number;
  allowLong: boolean;
}): Promise<ProviderHit | null> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.key) headers.Authorization = `Bearer ${options.key}`;
  try {
    const response = await fetch(options.url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: options.model,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        messages: [
          { role: "system", content: options.system },
          { role: "user", content: options.user },
        ],
      }),
      signal: AbortSignal.timeout(22_000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text || isBadAiText(text, options.allowLong)) return null;
    return { text, engine: options.engine };
  } catch {
    return null;
  }
}

async function anthropicReply(
  system: string,
  user: string,
  plan: EnginePlan,
  allowLong: boolean,
): Promise<ProviderHit | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: plan.model,
        max_tokens: plan.maxTokens,
        temperature: plan.temperature,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(22_000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      content?: Array<{ text?: string }>;
    };
    const text = data.content?.map((p) => p.text ?? "").join("").trim();
    if (!text || isBadAiText(text, allowLong)) return null;
    return { text, engine: "claude" };
  } catch {
    return null;
  }
}

function callEngine(plan: EnginePlan, system: string, user: string, allowLong: boolean): Promise<ProviderHit | null> {
  const common = {
    system,
    user,
    engine: plan.engine,
    maxTokens: plan.maxTokens,
    temperature: plan.temperature,
    allowLong,
    model: plan.model,
  };
  switch (plan.engine) {
    case "gpt-4o":
    case "gpt-4o-mini":
      return openAiCompatible({
        ...common,
        url: "https://api.openai.com/v1/chat/completions",
        key: process.env.OPENAI_API_KEY,
      });
    case "groq":
      return openAiCompatible({
        ...common,
        url: "https://api.groq.com/openai/v1/chat/completions",
        key: process.env.GROQ_API_KEY,
      });
    case "openrouter":
      return openAiCompatible({
        ...common,
        url: "https://openrouter.ai/api/v1/chat/completions",
        key: process.env.OPENROUTER_API_KEY,
      });
    case "openai-compatible":
      return process.env.OPENAI_COMPATIBLE_BASE_URL
        ? openAiCompatible({
            ...common,
            url: `${process.env.OPENAI_COMPATIBLE_BASE_URL.replace(/\/$/, "")}/chat/completions`,
            key: process.env.OPENAI_COMPATIBLE_API_KEY,
          })
        : Promise.resolve(null);
    case "claude":
      return anthropicReply(system, user, plan, allowLong);
  }
}

function repairUser(user: string, missed: string[]) {
  return `${user}

Previous draft missed: ${missed.join(", ")}.
Write a fresh WhatsApp reply that answers ALL remaining asks plus the earlier ones. Still sound like Tarik, first person.`;
}

export async function generateBestHumanReply(
  message: NormalizedMessage,
  ctx: AiContext,
): Promise<ProviderHit | null> {
  const prompt = buildPrompt(message, ctx);
  const analysis = prompt.analysis;
  const allowLong = analysis.preferredStyle === "complete";
  const plans = planReplyEngines(analysis);
  let best: ProviderHit | null = null;
  let bestScore = -1;

  for (const plan of plans) {
    const hit = await callEngine(plan, prompt.system, prompt.user, allowLong);
    if (!hit) continue;
    let text = hit.text;
    let score = scoreReplyCompleteness(text, analysis);
    const missed = missedTopics(text, analysis);
    if (allowLong && missed.length && score < 0.75) {
      const repaired = await callEngine(plan, prompt.system, repairUser(prompt.user, missed), allowLong);
      if (repaired) {
        const repairedScore = scoreReplyCompleteness(repaired.text, analysis);
        if (repairedScore >= score) {
          text = repaired.text;
          score = repairedScore;
        }
      }
    }
    const labeled = { text, engine: `${hit.engine} · ${plan.reason}` };
    if (score > bestScore) {
      best = labeled;
      bestScore = score;
    }
    if (score >= 0.72) return labeled;
  }

  if (best) return best;
  if (allowLong) {
    return { text: writeCompleteFallback(analysis, [...ctx.faqs, ...ctx.knowledge]), engine: "complete-fallback" };
  }
  return null;
}

export async function generateOpenAiReply(
  message: NormalizedMessage,
  ctx: AiContext,
): Promise<string | null> {
  const hit = await generateBestHumanReply(message, ctx);
  return hit?.text ?? null;
}

export type { ReplyEngineId };
