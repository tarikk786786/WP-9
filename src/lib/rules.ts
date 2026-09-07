import { defaultRules } from "@/lib/default-rules";
import type { BotRules, KeywordRule } from "@/lib/types";

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
    defaultReply: raw.defaultReply,
    greetingReply:
      typeof raw.greetingReply === "string"
        ? raw.greetingReply
        : defaultRules.greetingReply,
    includeName:
      typeof raw.includeName === "boolean"
        ? raw.includeName
        : defaultRules.includeName,
    businessHoursEnabled:
      typeof raw.businessHoursEnabled === "boolean"
        ? raw.businessHoursEnabled
        : defaultRules.businessHoursEnabled,
    timezone: typeof raw.timezone === "string" ? raw.timezone : defaultRules.timezone,
    openHour: typeof raw.openHour === "number" ? raw.openHour : defaultRules.openHour,
    closeHour: typeof raw.closeHour === "number" ? raw.closeHour : defaultRules.closeHour,
    afterHoursReply:
      typeof raw.afterHoursReply === "string"
        ? raw.afterHoursReply
        : defaultRules.afterHoursReply,
    keywordRules: raw.keywordRules,
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
