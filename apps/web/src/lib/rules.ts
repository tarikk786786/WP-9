import { defaultRules } from "./default-rules.ts";
import type { BotRules, KeywordRule } from "./types.ts";

function asTarik(text: string, fallback: string) {
  if (
    /on behalf|Tarik yahan hai|Tarik yahin hai|assistant|Tarik tak pahunch|public facts|calmly wapas|Extra detail ho to|forensics, AI, security|Message mil gaya/i.test(
      text,
    )
  ) {
    return fallback;
  }
  return text;
}

function isKeywordRule(value: unknown): value is KeywordRule {
  if (!value || typeof value !== "object") return false;
  const rule = value as KeywordRule;
  return (
    typeof rule.id === "string" &&
    typeof rule.keyword === "string" &&
    typeof rule.reply === "string" &&
    typeof rule.enabled === "boolean"
  );
}

export function parseRules(value: unknown): BotRules | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<BotRules>;
  if (typeof raw.enabled !== "boolean") return null;
  if (typeof raw.defaultReply !== "string") return null;
  if (!Array.isArray(raw.keywordRules) || !raw.keywordRules.every(isKeywordRule)) {
    return null;
  }

  return {
    enabled: raw.enabled,
    botName: typeof raw.botName === "string" ? raw.botName : defaultRules.botName,
    defaultReply: asTarik(raw.defaultReply, defaultRules.defaultReply),
    greetingReply: asTarik(
      typeof raw.greetingReply === "string" ? raw.greetingReply : defaultRules.greetingReply,
      defaultRules.greetingReply,
    ),
    includeName:
      typeof raw.includeName === "boolean"
        ? raw.includeName
        : defaultRules.includeName,
    useLocalLlm:
      typeof raw.useLocalLlm === "boolean" ? raw.useLocalLlm : defaultRules.useLocalLlm,
    preferredModel:
      typeof raw.preferredModel === "string" ? raw.preferredModel : defaultRules.preferredModel,
    language:
      raw.language === "english" || raw.language === "hindi" || raw.language === "hinglish"
        ? raw.language
        : defaultRules.language,
    tone: raw.tone === "warm" || raw.tone === "sharp" || raw.tone === "soft" ? raw.tone : defaultRules.tone,
    emoji: typeof raw.emoji === "boolean" ? raw.emoji : defaultRules.emoji,
    signature: typeof raw.signature === "string" ? raw.signature : defaultRules.signature,
    customFacts: typeof raw.customFacts === "string" ? raw.customFacts : defaultRules.customFacts,
    replyMode:
      raw.replyMode === "keywords" || raw.replyMode === "greetings" || raw.replyMode === "all"
        ? raw.replyMode
        : defaultRules.replyMode,
    replyToMedia: typeof raw.replyToMedia === "boolean" ? raw.replyToMedia : defaultRules.replyToMedia,
    replyToGroups: typeof raw.replyToGroups === "boolean" ? raw.replyToGroups : defaultRules.replyToGroups,
    showTyping: typeof raw.showTyping === "boolean" ? raw.showTyping : defaultRules.showTyping,
    businessHoursEnabled:
      typeof raw.businessHoursEnabled === "boolean"
        ? raw.businessHoursEnabled
        : defaultRules.businessHoursEnabled,
    timezone: typeof raw.timezone === "string" ? raw.timezone : defaultRules.timezone,
    openHour: typeof raw.openHour === "number" ? raw.openHour : defaultRules.openHour,
    closeHour: typeof raw.closeHour === "number" ? raw.closeHour : defaultRules.closeHour,
    afterHoursReply: asTarik(
      typeof raw.afterHoursReply === "string"
        ? raw.afterHoursReply
        : defaultRules.afterHoursReply,
      defaultRules.afterHoursReply,
    ),
    keywordRules: raw.keywordRules.map((rule) => ({
      ...rule,
      reply: asTarik(rule.reply, rule.reply.replace(/Tarik yahan hai|Tarik yahin hai/gi, "main yahin hoon")),
    })),
  };
}

export function getDeployedRules(): BotRules {
  const fromEnv = process.env.REPLY_RULES_JSON;
  if (!fromEnv) return defaultRules;
  try {
    const parsed = parseRules(JSON.parse(fromEnv));
    return parsed ?? defaultRules;
  } catch {
    return defaultRules;
  }
}
