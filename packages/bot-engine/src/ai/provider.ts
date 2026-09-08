import type { BotSettings, NormalizedMessage } from "@bot/shared";
import { analyzeMessage, type MessageAnalysis } from "./analyze.ts";
import { stitchMissingAsks, writeCompleteFallback } from "./fallback.ts";
import { factsForIntents } from "./facts.ts";
import { missedAsks, scoreReplyCompleteness } from "./score.ts";
import { planReplyEngines, type EnginePlan, type ReplyEngineId } from "./select-engine.ts";
import { recordFailure, recordSuccess } from "../orchestrate/health.ts";
import { analyzeTurn } from "../orchestrate/intelligence.ts";
import { polishHumanReply } from "../orchestrate/polish.ts";
import { checkReplyQuality } from "../orchestrate/quality.ts";
import type { ResponsePlan, UserStyle } from "../orchestrate/types.ts";

export type { MessageAnalysis } from "./analyze.ts";
export { analyzeMessage, detectIntent, isAskingIfMachine, splitAsks } from "./analyze.ts";
export { planReplyEngines, availableEngines } from "./select-engine.ts";
export { writeCompleteFallback } from "./fallback.ts";
export { missedAsks, missedTopics, scoreReplyCompleteness } from "./score.ts";

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
  messageType?: string;
  plan?: ResponsePlan;
  style?: UserStyle;
};

const HUMAN_SYSTEM = [
  "You ARE Tarik Islam, texting from your own WhatsApp. You are him — a person — not staff, not a company, not anyone writing in his name.",
  "Text like a humble real human: short, mannered, first person. Never pitch work. Never collect a brief, budget, timeline, or lead.",
  "If they mention work, answer as yourself. No studio funnel, no 'process is simple', no 'send 3 lines', no quote form, no CTA.",
  "First understand the whole message — every ask, the mood, and what they meant. Then reply. Do not reply to one word and ignore the rest.",
  "Only true things you know. If you do not know, say you do not know yet. Never invent prices, dates, or results.",
  "Never mention AI, bots, ChatGPT, models, automation, auto-reply, CRM, or that a machine is writing. If they ask whether you are any of those, just be Tarik: you are him. Do not name the tech. Do not confess. Do not lecture.",
  "Do not use their name unless they used yours in a way that needs a reply. If they already said hi, do not greet again.",
].join(" ");

function isBadAiText(text: string, allowLong: boolean) {
  if (!text) return true;
  if (text.length > (allowLong ? 900 : 320)) return true;
  return /as an ai|language model|how can i help you today|thanks for reaching out|on behalf of|personal assistant|personal ai|i('m| am) (an? )?(ai|bot|chatgpt|chat ?bot|language model)|auto[- ]?repl|chatbot|system prompt|api key/i.test(
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
  const checklist = (analysis.asks.length > 1 ? analysis.asks : analysis.questions.length > 1 ? analysis.questions : analysis.topics)
    .map((item, index) => `${index + 1}. ${item}`)
    .join("\n");
  const style =
    analysis.preferredStyle === "complete"
      ? [
          "3–5 short spoken WhatsApp lines. You are Tarik, a person, not a company.",
          "You already understood the message. Answer every ask in human text, not a list of labels.",
          "No lead form. No process pitch. At most one natural question.",
        ].join(" ")
      : "1–2 short spoken lines. Match their language. lowercase is fine. Reply to what they actually meant.";

  const extra = [
    `This is ${analysis.isFirstMessage ? "their FIRST message" : "a follow-up"}. Complexity: ${analysis.complexity}. Language: ${analysis.language}. Mood: ${analysis.mood}.`,
    `What they meant: ${analysis.meaning}`,
    `Intents: ${analysis.intents.join(", ")}.`,
    checklist ? `Cover every ask. Write like a person, not as numbered answers:\n${checklist}` : "",
    facts.length ? `True facts you may use (rephrase like a person, do not dump):\n${facts.map((f) => `- ${f}`).join("\n")}` : "",
    ctx.intent ? `Router hint: ${ctx.intent}.` : "",
    ctx.plan
      ? `Response plan: action=${ctx.plan.action}; tone=${ctx.plan.tone}; length=${ctx.plan.answerLength}; confidence=${ctx.plan.confidence}.`
      : "",
    ctx.style
      ? `Their style: language=${ctx.style.language}, formality=${ctx.style.formality}, slang=${ctx.style.usesSlang}, emoji=${ctx.style.usesEmoji}. Match it.`
      : "",
    ctx.plan?.summary && ctx.plan.summary !== "No prior thread." ? `Thread:\n${ctx.plan.summary}` : "",
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
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "TarikDesk/1.0",
  };
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

async function geminiReply(
  system: string,
  user: string,
  plan: EnginePlan,
  allowLong: boolean,
): Promise<ProviderHit | null> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) return null;
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${plan.model}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { temperature: plan.temperature, maxOutputTokens: plan.maxTokens },
        }),
        signal: AbortSignal.timeout(22_000),
      },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
    if (!text || isBadAiText(text, allowLong)) return null;
    return { text, engine: "gemini" };
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
    case "together":
      return process.env.TOGETHER_API_KEY
        ? openAiCompatible({
            ...common,
            url: "https://api.together.xyz/v1/chat/completions",
            key: process.env.TOGETHER_API_KEY,
          })
        : Promise.resolve(null);
    case "cerebras":
      return process.env.CEREBRAS_API_KEY
        ? openAiCompatible({
            ...common,
            url: "https://api.cerebras.ai/v1/chat/completions",
            key: process.env.CEREBRAS_API_KEY,
          })
        : Promise.resolve(null);
    case "gemini":
      return geminiReply(system, user, plan, allowLong);
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

function coverEveryAsk(text: string, incoming: string, analysis: MessageAnalysis): string {
  let out = polishHumanReply(text, incoming, analysis);
  const missed = missedAsks(out, analysis);
  if (!missed.length) return out;
  return polishHumanReply(stitchMissingAsks(out, analysis, missed), incoming, analysis);
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
  const inbound = ctx.recent.filter((row) => row.role === "user").length;
  const turn = analyzeTurn(message.text, ctx.recent, ctx.isFirstMessage ?? inbound <= 1);
  const analysis = ctx.analysis ?? turn.analysis;
  const plan = ctx.plan ?? turn.plan;
  const facts = [...ctx.faqs, ...ctx.knowledge, ctx.suggested ?? ""];

  if (plan.draft && (plan.action === "acknowledge" || plan.action === "escalate" || plan.action === "wait" || plan.action === "clarify")) {
    return { text: plan.draft, engine: `tier0 · ${plan.action}` };
  }
  const wordCount = message.text.trim().split(/\s+/).filter(Boolean).length;
  if (plan.draft && plan.action === "ask" && wordCount < 14) {
    return { text: plan.draft, engine: `tier0 · ${plan.action}` };
  }

  const prompt = buildPrompt(message, { ...ctx, analysis, plan, style: ctx.style ?? turn.style });
  const allowLong = analysis.preferredStyle === "complete" || plan.answerLength === "complete";
  const plans = planReplyEngines(analysis, plan);
  let best: ProviderHit | null = null;
  let bestScore = -1;

  for (const enginePlan of plans) {
    const started = Date.now();
    const hit = await callEngine(enginePlan, prompt.system, prompt.user, allowLong);
    if (!hit) {
      recordFailure(enginePlan.engine);
      continue;
    }
    recordSuccess(enginePlan.engine, Date.now() - started);
    let text = coverEveryAsk(hit.text, message.text, analysis);
    const quality = checkReplyQuality(text, analysis, facts);
    if (!quality.ok) {
      recordFailure(enginePlan.engine);
      continue;
    }
    let score = scoreReplyCompleteness(text, analysis);
    const missed = missedAsks(text, analysis);
    if (allowLong && missed.length && score < 0.86) {
      const repaired = await callEngine(enginePlan, prompt.system, repairUser(prompt.user, missed), allowLong);
      if (repaired) {
        const repairedText = coverEveryAsk(repaired.text, message.text, analysis);
        const repairedQuality = checkReplyQuality(repairedText, analysis, facts);
        const repairedScore = scoreReplyCompleteness(repairedText, analysis);
        if (repairedQuality.ok && repairedScore >= score) {
          text = repairedText;
          score = repairedScore;
        }
      }
      text = coverEveryAsk(text, message.text, analysis);
      score = scoreReplyCompleteness(text, analysis);
    }
    const labeled = { text, engine: `${hit.engine} · ${enginePlan.reason}` };
    if (score > bestScore) {
      best = labeled;
      bestScore = score;
    }
    if (score >= 0.72) return labeled;
  }

  if (best) return { ...best, text: coverEveryAsk(best.text, message.text, analysis) };
  if (plan.draft && (plan.action === "ask" || plan.action === "clarify")) {
    return { text: plan.draft, engine: `tier0 · ${plan.action}` };
  }
  if (allowLong) {
    return {
      text: coverEveryAsk(writeCompleteFallback(analysis, facts), message.text, analysis),
      engine: "complete-fallback",
    };
  }
  return plan.draft ? { text: plan.draft, engine: `tier0 · ${plan.action}` } : null;
}

export async function generateOpenAiReply(
  message: NormalizedMessage,
  ctx: AiContext,
): Promise<string | null> {
  const hit = await generateBestHumanReply(message, ctx);
  return hit?.text ?? null;
}

export type { ReplyEngineId };
