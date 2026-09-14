import type { BotSettings, NormalizedMessage } from "@bot/shared";
import { analyzeMessage, type MessageAnalysis } from "./analyze.ts";
import { stitchMissingAsks, writeCompleteFallback } from "./fallback.ts";
import { factsForIntents, tarikSiteBrief } from "./facts.ts";
import { missedAsks, scoreReplyCompleteness } from "./score.ts";
import { planReplyEngines, type EnginePlan, type ReplyEngineId } from "./select-engine.ts";
import { recordFailure, recordSuccess } from "../orchestrate/health.ts";
import { analyzeTurn } from "../orchestrate/intelligence.ts";
import { polishHumanReply } from "../orchestrate/polish.ts";
import { stripModelNoise } from "../orchestrate/compose.ts";
import { checkReplyQuality } from "../orchestrate/quality.ts";
import { avoidRepeat, isCannedFallback, writeSpokenReply } from "../orchestrate/spoken.ts";
import type { ResponsePlan, UserStyle } from "../orchestrate/types.ts";
import { DAZY_LOVE_SYSTEM, findSpecialPerson, type SpecialPerson } from "../people.ts";

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
  person?: SpecialPerson;
};

const HUMAN_SYSTEM = [
  "You ARE Tarik Islam, texting on WhatsApp as yourself in the first person. You are a forensic scientist, cybersecurity engineer, and founder & CEO of Dezo.in. A person, not a desk, not a company, not staff.",
  "Persona: Smart, highly professional, genuinely humble, calm, dignified, and helpful.",
  "Smart Intelligence: You grasp technical and business nuances instantly. You understand what the person actually needs, synthesize context effortlessly, and answer with intellectual clarity and engineering substance. No rambling, no filler, no repeating their question back to them.",
  "Professional Standard: Unwavering courtesy, polished speech, and respectful address (always use 'aap' and 'ji', never 'bhai', 'bro', 'dude', 'yaar', 'sir', or 'ma'am' with clients or acquaintances). Keep commitments clear and realistic. No corporate jargon, no sales pressure, no robotic customer-service templates.",
  "Humble Demeanor (Inkisaari): You never boast, show off, or claim to be the best, expert, or genius. Let your work speak for itself. If praised, accept with humble grace ('Alhamdulillah, aapki meherbani hai'). In disagreements, take responsibility first without defensiveness ('Shayad main theek se samajh nahi paya, ek baar clarify kar dijiye'). Never invent answers, rates, or delivery dates if uncertain.",
  "Islamic Adab & Etiquette: Greet warmly with 'Assalamu Alaikum' when starting a chat or replying to an opening greeting. Reply to Salam with 'Walaikum Assalam' (or 'Walaikum Assalam wa Rahmatullahi wa Barakatuh'). In ongoing back-and-forth messages, do NOT repeat Salam every turn — just continue the conversation naturally. When asked how you are, say 'Alhamdulillah, sab theek hai. Aap bataiye, sab kaisa chal raha hai?'. When thanked, say 'JazakAllah Khair' or 'Bahut shukriya'. When discussing future work, meetings, or timeline, say 'InshaAllah'. Keep it completely natural and sincere.",
  "Technical & Domain Depth: When asked about digital forensics, data recovery, cybersecurity incidents, or software architecture, provide calm, authoritative guidance. Never promise instant magic hacking; focus on legitimate zero-trust security and sound forensic methodology.",
  "Never mention AI, bots, ChatGPT, models, automation, or auto-reply. If asked if you are an AI: 'ji, main hi hoon. boliye' — speak strictly as the real Tarik.",
  "Answer length: 1–3 short, clear, well-spoken WhatsApp lines. Concise, elegant, and directly useful.",
  "Voice examples: hi → Assalamu Alaikum! Ji boliye, kya haal hai? website kitna → InshaAllah pricing scope pe depend karti hai. Pehle bataiye kya banana hai. thanks → JazakAllah Khair / Bahut shukriya, koi baat nahi. stuck → Boliye kahan dikkat aa rahi hai, saath mein samajhte hain.",
].join(" ");

function isBadAiText(text: string, allowLong: boolean) {
  if (!text) return true;
  if (/<think>|<\/think>/i.test(text)) return true;
  if (text.length > (allowLong ? 900 : 320)) return true;
  return /as an ai|language model|how can i help you today|thanks for reaching out|on behalf of|personal assistant|personal ai|i('m| am) (an? )?(ai|bot|chatgpt|chat ?bot|language model)|auto[- ]?repl|chatbot|system prompt|api key/i.test(
    text,
  );
}

export function buildPrompt(message: NormalizedMessage, ctx: AiContext) {
  const person = ctx.person ?? findSpecialPerson({ jid: message.chatId, fromName: ctx.customerName, number: message.sender });
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
  const factsRaw = factsForIntents(analysis.topics, [...ctx.faqs, ...ctx.knowledge, ctx.suggested ?? ""]);
  const already = ctx.recent
    .filter((row) => row.role === "assistant")
    .map((row) => row.text)
    .join("\n")
    .toLowerCase();
  const facts = (person?.voice === "love" && !analysis.topics.some((topic) =>
    ["pricing", "website", "studio", "services", "process", "portfolio", "credentials", "availability"].includes(topic),
  )
    ? []
    : already
      ? factsRaw.filter((fact) => !already.includes(fact.slice(0, 22).toLowerCase()))
      : factsRaw);
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

  const moodHint =
    analysis.mood === "stressed"
      ? "They sound pressed. Keep it short and exact."
      : analysis.mood === "warm"
        ? "They are warm. Stay soft, no extra pitch."
        : analysis.mood === "casual"
          ? "They are casual. Match that, still mannered."
          : "Stay calm and human.";
  const langHint =
    analysis.language === "english"
      ? "Reply in natural English. No Hinglish dump."
      : analysis.language === "hindi"
        ? "Reply in simple Hindi/Hinglish, spoken."
        : "Reply in spoken Hinglish. Do not switch into brochure English.";
  const extra = [
    `This is ${analysis.isFirstMessage ? "their FIRST message" : "a follow-up"}. Complexity: ${analysis.complexity}. Language: ${analysis.language}. Mood: ${analysis.mood}.`,
    langHint,
    moodHint,
    `What they meant: ${analysis.meaning}`,
    `Intents: ${analysis.intents.join(", ")}.`,
    checklist ? `Cover every ask. Write like a person, not as numbered answers:\n${checklist}` : "",
    facts.length ? `True facts you may use (rephrase like a person, weave them in, do not dump as a last labeled line):\n${facts.map((f) => `- ${f}`).join("\n")}` : "",
    already ? "Do not repeat facts already said in the thread." : "",
    ctx.intent ? `Router hint: ${ctx.intent}.` : "",
    ctx.plan
      ? `Response plan: action=${ctx.plan.action}; tone=${ctx.plan.tone}; length=${ctx.plan.answerLength}; confidence=${ctx.plan.confidence}.`
      : "",
    ctx.style
      ? `Their style: language=${ctx.style.language}, formality=${ctx.style.formality}, slang=${ctx.style.usesSlang}, emoji=${ctx.style.usesEmoji}. Match it.`
      : "",
    ctx.plan?.summary && ctx.plan.summary !== "No prior thread." ? `Thread:\n${ctx.plan.summary}` : "",
    person?.voice === "love" ? `This is ${person.name}. Speak only with love, no gender labels.` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const systemCore = person?.voice === "love" ? DAZY_LOVE_SYSTEM : HUMAN_SYSTEM;
  const brief = person?.voice === "love" ? "Work facts only if they asked work. Default is love, not the studio." : tarikSiteBrief();
  return {
    system: [systemCore, brief, style, `Preferred language: ${analysis.language}.`, extra].join("\n"),
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
    if (!text) return null;
    const clean = stripModelNoise(text);
    if (!clean || isBadAiText(clean, options.allowLong)) return null;
    return { text: clean, engine: options.engine };
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
    if (!text) return null;
    const clean = stripModelNoise(text);
    if (!clean || isBadAiText(clean, allowLong)) return null;
    return { text: clean, engine: "claude" };
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
    if (!text) return null;
    const clean = stripModelNoise(text);
    if (!clean || isBadAiText(clean, allowLong)) return null;
    return { text: clean, engine: "gemini" };
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
  const person = ctx.person ?? findSpecialPerson({ jid: message.chatId, fromName: ctx.customerName, number: message.sender }) ?? undefined;
  const inbound = ctx.recent.filter((row) => row.role === "user").length;
  const turn = analyzeTurn(message.text, ctx.recent, ctx.isFirstMessage ?? inbound <= 1, person);
  const analysis = ctx.analysis ?? turn.analysis;
  const plan = ctx.plan ?? turn.plan;
  const facts = [...ctx.faqs, ...ctx.knowledge, ctx.suggested ?? ""];

  if (plan.draft && (plan.action === "acknowledge" || plan.action === "escalate" || plan.action === "wait" || plan.action === "clarify")) {
    return { text: avoidRepeat(plan.draft, ctx.recent), engine: `tier0 · ${plan.action}` };
  }
  const wordCount = message.text.trim().split(/\s+/).filter(Boolean).length;
  if (plan.draft && plan.action === "ask" && wordCount < 14) {
    return { text: avoidRepeat(plan.draft, ctx.recent), engine: `tier0 · ${plan.action}` };
  }
  if (plan.draft && (plan.confidence ?? 0) >= 0.88) {
    return { text: avoidRepeat(plan.draft, ctx.recent), engine: `tier0 · ${plan.action}` };
  }

  const prompt = buildPrompt(message, { ...ctx, analysis, plan, style: ctx.style ?? turn.style, person });
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
    if (score >= 0.72) return { ...labeled, text: avoidRepeat(labeled.text, ctx.recent) };
  }

  if (best) {
    const covered = coverEveryAsk(best.text, message.text, analysis);
    return { ...best, text: avoidRepeat(isCannedFallback(covered) ? writeSpokenReply(message.text, analysis, ctx.recent, person) : covered, ctx.recent) };
  }
  if (plan.draft && (plan.action === "ask" || plan.action === "clarify")) {
    return { text: avoidRepeat(plan.draft, ctx.recent), engine: `tier0 · ${plan.action}` };
  }
  if (allowLong) {
    const complete = coverEveryAsk(writeCompleteFallback(analysis, facts, message.text), message.text, analysis);
    return {
      text: avoidRepeat(isCannedFallback(complete) ? writeSpokenReply(message.text, analysis, ctx.recent, person) : complete, ctx.recent),
      engine: "complete-fallback",
    };
  }
  if (plan.draft) {
    return { text: avoidRepeat(plan.draft, ctx.recent), engine: `tier0 · ${plan.action}` };
  }
  return {
    text: writeSpokenReply(message.text, analysis, ctx.recent, person),
    engine: "spoken",
  };
}

export async function generateOpenAiReply(
  message: NormalizedMessage,
  ctx: AiContext,
): Promise<string | null> {
  const hit = await generateBestHumanReply(message, ctx);
  return hit?.text ?? null;
}

export type { ReplyEngineId };
