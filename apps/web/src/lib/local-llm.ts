import { mkdir } from "node:fs/promises";
import { profileBrief } from "@/lib/tarik-profile";
import type { BotRules, LlmEndpoint } from "@/lib/types";
import { writablePath } from "@/lib/writable-dir";

export type LlmGeneration = {
  text: string;
  engine: string;
};

const LOCAL_TARGETS: Array<{
  id: string;
  name: string;
  kind: "ollama" | "openai-compatible";
  baseUrl: string;
}> = [
  { id: "ollama", name: "Ollama", kind: "ollama", baseUrl: "http://127.0.0.1:11434" },
  { id: "lmstudio", name: "LM Studio", kind: "openai-compatible", baseUrl: "http://127.0.0.1:1234" },
  { id: "jan", name: "Jan", kind: "openai-compatible", baseUrl: "http://127.0.0.1:1337" },
  { id: "llamacpp", name: "llama.cpp", kind: "openai-compatible", baseUrl: "http://127.0.0.1:8080" },
  { id: "kobold", name: "KoboldCpp", kind: "openai-compatible", baseUrl: "http://127.0.0.1:5001" },
];

function systemPrompt(rules: BotRules, fromName: string) {
  const facts = rules.keywordRules
    .filter((rule) => rule.enabled)
    .map((rule) => `- If they mention “${rule.keyword}”: ${rule.reply}`)
    .join("\n");

  return [
    "You are Tarik, texting on WhatsApp like a real person. First person only. Never an assistant.",
    "If they asked several things, answer every ask in short lines. Otherwise 1–2 lines.",
    "Casual Hinglish. lowercase ok. No bio dump. No website unless they asked.",
    "Never say message received, public facts, calmly, on behalf, or Main Tarik hoon — forensics.",
    "Do not paste greetings and defaults together. Just answer what they said.",
    "Never invent prices or credentials.",
    profileBrief(),
    fromName ? `Their name is ${fromName}. Do not start with their name.` : "",
    facts ? `Only if they asked that topic:\n${facts}` : "",
    `If nothing fits: ${rules.defaultReply}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 1200) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

let discoveryCache: { at: number; value: LlmEndpoint[] } | null = null;

export async function discoverLocalLlms(): Promise<LlmEndpoint[]> {
  if (discoveryCache && Date.now() - discoveryCache.at < 20_000) {
    return discoveryCache.value;
  }
  const found = await Promise.all(
    LOCAL_TARGETS.map(async (target) => {
      try {
        if (target.kind === "ollama") {
          const data = (await fetchJson(`${target.baseUrl}/api/tags`)) as {
            models?: Array<{ name?: string }>;
          };
          const models = (data.models ?? []).map((model) => model.name ?? "").filter(Boolean);
          return { ...target, online: true, live: true, models };
        }
        const data = (await fetchJson(`${target.baseUrl}/v1/models`)) as {
          data?: Array<{ id?: string }>;
        };
        const models = (data.data ?? []).map((model) => model.id ?? "").filter(Boolean);
        return { ...target, online: true, live: true, models };
      } catch {
        return { ...target, online: false, live: true, models: ["Soft Hinglish voice"] };
      }
    }),
  );

  const list: LlmEndpoint[] = [
    {
      id: "hinglish",
      name: "Hinglish soft voice",
      kind: "hinglish",
      online: true,
      live: true,
      models: ["always-live · calm Hinglish"],
    },
    ...found,
    {
      id: "transformers",
      name: "On-device Flan",
      kind: "transformers",
      online: true,
      live: true,
      models: ["Xenova/LaMini-Flan-T5-248M"],
    },
  ];
  discoveryCache = { at: Date.now(), value: list };
  return list;
}

async function generateOllama(baseUrl: string, model: string, prompt: string, system: string) {
  const data = (await fetchJson(
    `${baseUrl}/api/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        options: { temperature: 0.35, num_predict: 120 },
      }),
    },
    20_000,
  )) as { message?: { content?: string } };
  const text = data.message?.content?.trim();
  if (!text) throw new Error("Empty Ollama reply.");
  return text;
}

async function generateOpenAi(baseUrl: string, model: string, prompt: string, system: string) {
  const data = (await fetchJson(
    `${baseUrl}/v1/chat/completions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        max_tokens: 360,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      }),
    },
    20_000,
  )) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Empty local OpenAI-compatible reply.");
  return text;
}

type Text2Text = (input: string, options?: { max_new_tokens?: number }) => Promise<Array<{ generated_text?: string }>>;

let transformersPipeline: Text2Text | null = null;
let transformersLoading: Promise<Text2Text> | null = null;

async function getTransformers(): Promise<Text2Text> {
  if (transformersPipeline) return transformersPipeline;
  if (!transformersLoading) {
    transformersLoading = (async () => {
      const cacheDir = writablePath("models");
      await mkdir(cacheDir, { recursive: true });
      process.env.TRANSFORMERS_CACHE = cacheDir;
      const { pipeline } = await import("@huggingface/transformers");
      const pipe = await pipeline("text2text-generation", "Xenova/LaMini-Flan-T5-248M");
      transformersPipeline = pipe as unknown as Text2Text;
      return transformersPipeline;
    })();
  }
  return transformersLoading;
}

export function warmLocalModel() {
  void getTransformers().catch(() => undefined);
}

export async function generateLocalReply(
  incoming: string,
  fromName: string,
  rules: BotRules,
): Promise<LlmGeneration> {
  const system = systemPrompt(rules, fromName);
  const endpoints = await discoverLocalLlms();
  const preferred = rules.preferredModel?.trim();

  const ordered = [...endpoints].sort((a, b) => {
    if (preferred && a.models.includes(preferred)) return -1;
    if (preferred && b.models.includes(preferred)) return 1;
    if (a.kind === "transformers") return 1;
    if (b.kind === "transformers") return -1;
    return Number(b.online) - Number(a.online);
  });

  const errors: string[] = [];
  for (const endpoint of ordered) {
    if (!endpoint.online || endpoint.kind === "hinglish") continue;
    try {
      if (endpoint.kind === "ollama" && endpoint.baseUrl) {
        const model = preferred && endpoint.models.includes(preferred) ? preferred : endpoint.models[0];
        if (!model) throw new Error("Ollama is running but has no model pulled.");
        const text = await generateOllama(endpoint.baseUrl, model, incoming, system);
        return { text, engine: `${endpoint.name} · ${model}` };
      }
      if (endpoint.kind === "openai-compatible" && endpoint.baseUrl) {
        const model = preferred && endpoint.models.includes(preferred) ? preferred : endpoint.models[0] || "local";
        const text = await generateOpenAi(endpoint.baseUrl, model, incoming, system);
        return { text, engine: `${endpoint.name} · ${model}` };
      }
      if (endpoint.kind === "transformers") {
        if (process.env.VERCEL) continue;
        const pipe = await getTransformers();
        const out = await pipe(`${system}\n\n${incoming}`, { max_new_tokens: 64 });
        const text = out[0]?.generated_text?.trim();
        if (!text) throw new Error("Empty on-device reply.");
        return { text, engine: `${endpoint.name}` };
      }
    } catch (error) {
      errors.push(`${endpoint.name}: ${error instanceof Error ? error.message : "failed"}`);
    }
  }

  throw new Error(errors[0] ?? "No local LLM produced a reply.");
}
