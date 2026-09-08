import type { BotSettings, NormalizedMessage } from "@bot/shared";

export type AiContext = {
  settings: BotSettings;
  customerName: string;
  recent: Array<{ role: "user" | "assistant"; text: string }>;
  faqs: string[];
  knowledge: string[];
  intent?: string;
  suggested?: string;
};

const HUMAN_SYSTEM = [
  "You are Tarik Islam, a real person, texting on WhatsApp.",
  "Write like a human, not a bot or assistant. First person only.",
  "1–2 short lines. Calm Hinglish (Hindi + English mix). lowercase is fine.",
  "Reply to what they actually said. No brochure, no job titles, no website unless they asked.",
  "Do not invent prices, orders, policies, or that a human already replied.",
  "Do not mention AI, models, or that you are automated.",
  "No 'How can I help you today', no 'Thanks for reaching out', no stacked bios.",
].join(" ");

function isBadAiText(text: string) {
  if (!text || text.length > 280) return true;
  return /as an ai|language model|how can i help you today|thanks for reaching out|on behalf of|system prompt|api key/i.test(
    text,
  );
}

export function buildPrompt(message: NormalizedMessage, ctx: AiContext) {
  const history = ctx.recent
    .slice(-8)
    .map((m) => `${m.role}: ${m.text}`)
    .join("\n");
  const extra = [
    ctx.intent ? `Intent hint: ${ctx.intent}.` : "",
    ctx.suggested ? `If useful, this is the true fact to stay close to (rephrase like a person, do not paste): ${ctx.suggested}` : "",
    ctx.faqs.length ? `FAQ facts:\n${ctx.faqs.slice(0, 6).join("\n")}` : "",
    ctx.knowledge.length ? `Notes:\n${ctx.knowledge.slice(0, 3).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return {
    system: [HUMAN_SYSTEM, `Language: ${ctx.settings.defaultLanguage}.`, extra].filter(Boolean).join("\n"),
    user: `${history}\nuser (${ctx.customerName}): ${message.text}`.trim(),
  };
}

export function detectIntent(text: string): string {
  const lower = text.toLowerCase();
  if (/\b(hi|hello|hey|salam|namaste)\b/.test(lower)) return "greeting";
  if (/\b(price|cost|rate)\b/.test(lower)) return "pricing";
  if (/\b(hour|timing|open)\b/.test(lower)) return "hours";
  if (/\b(agent|human)\b/.test(lower)) return "handoff";
  return "general";
}

type ProviderHit = { text: string; engine: string };

async function openAiCompatible(options: {
  url: string;
  key?: string;
  model: string;
  system: string;
  user: string;
  engine: string;
}): Promise<ProviderHit | null> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.key) headers.Authorization = `Bearer ${options.key}`;
  try {
    const response = await fetch(options.url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: options.model,
        temperature: 0.55,
        max_tokens: 120,
        messages: [
          { role: "system", content: options.system },
          { role: "user", content: options.user },
        ],
      }),
      signal: AbortSignal.timeout(14_000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text || isBadAiText(text)) return null;
    return { text, engine: options.engine };
  } catch {
    return null;
  }
}

async function anthropicReply(system: string, user: string): Promise<ProviderHit | null> {
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
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
        max_tokens: 120,
        temperature: 0.55,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(14_000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      content?: Array<{ text?: string }>;
    };
    const text = data.content?.map((p) => p.text ?? "").join("").trim();
    if (!text || isBadAiText(text)) return null;
    return { text, engine: "claude" };
  } catch {
    return null;
  }
}

export async function generateBestHumanReply(
  message: NormalizedMessage,
  ctx: AiContext,
): Promise<ProviderHit | null> {
  const prompt = buildPrompt(message, ctx);
  const tries: Array<() => Promise<ProviderHit | null>> = [
    () =>
      process.env.OPENAI_API_KEY
        ? openAiCompatible({
            url: "https://api.openai.com/v1/chat/completions",
            key: process.env.OPENAI_API_KEY,
            model: process.env.OPENAI_MODEL || "gpt-4o",
            system: prompt.system,
            user: prompt.user,
            engine: "gpt-4o",
          })
        : Promise.resolve(null),
    () => anthropicReply(prompt.system, prompt.user),
    () =>
      process.env.GROQ_API_KEY
        ? openAiCompatible({
            url: "https://api.groq.com/openai/v1/chat/completions",
            key: process.env.GROQ_API_KEY,
            model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
            system: prompt.system,
            user: prompt.user,
            engine: "groq",
          })
        : Promise.resolve(null),
    () =>
      process.env.OPENROUTER_API_KEY
        ? openAiCompatible({
            url: "https://openrouter.ai/api/v1/chat/completions",
            key: process.env.OPENROUTER_API_KEY,
            model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
            system: prompt.system,
            user: prompt.user,
            engine: "openrouter",
          })
        : Promise.resolve(null),
    () =>
      process.env.OPENAI_COMPATIBLE_BASE_URL
        ? openAiCompatible({
            url: `${process.env.OPENAI_COMPATIBLE_BASE_URL.replace(/\/$/, "")}/chat/completions`,
            key: process.env.OPENAI_COMPATIBLE_API_KEY,
            model: process.env.OPENAI_COMPATIBLE_MODEL || "local",
            system: prompt.system,
            user: prompt.user,
            engine: "openai-compatible",
          })
        : Promise.resolve(null),
  ];

  for (const tryProvider of tries) {
    const hit = await tryProvider();
    if (hit) return hit;
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
