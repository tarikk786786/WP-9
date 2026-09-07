import type { BotRules } from "@/lib/types";

export type ReplyDecision =
  | { action: "skip"; reason: string }
  | { action: "reply"; text: string; matchedRule: string };

const GREETING_WORDS = new Set(["hi", "hello", "hey", "hola", "salam", "yo"]);

function hourInTimezone(date: Date, timezone: string): number | null {
  try {
    const hour = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: timezone,
    }).format(date);
    return Number.parseInt(hour, 10);
  } catch {
    return date.getUTCHours();
  }
}

function isWithinHours(rules: BotRules, now: Date): boolean {
  const hour = hourInTimezone(now, rules.timezone);
  if (hour === null) return true;
  if (rules.openHour === rules.closeHour) return true;
  if (rules.openHour < rules.closeHour) {
    return hour >= rules.openHour && hour < rules.closeHour;
  }
  return hour >= rules.openHour || hour < rules.closeHour;
}

function personalize(text: string, name: string, includeName: boolean): string {
  const first = name.trim().split(/\s+/)[0];
  if (!includeName || !first) return text;
  return `${first} — ${text}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function decideReply(
  incoming: string,
  fromName: string,
  rules: BotRules,
  now = new Date(),
): ReplyDecision {
  if (!rules.enabled) {
    return { action: "skip", reason: "Auto-reply is turned off." };
  }

  const body = incoming.trim();
  if (!body) {
    return { action: "skip", reason: "Empty message." };
  }

  if (rules.businessHoursEnabled && !isWithinHours(rules, now)) {
    return {
      action: "reply",
      text: rules.afterHoursReply,
      matchedRule: "after-hours",
    };
  }

  const lower = body.toLowerCase();
  const words = lower.split(/\s+/);

  const keywordHit = rules.keywordRules
    .filter((rule) => {
      if (!rule.enabled || !rule.keyword.trim()) return false;
      const needle = rule.keyword.trim().toLowerCase();
      const pattern = new RegExp(
        `(^|[^a-z0-9])${escapeRegExp(needle)}([^a-z0-9]|$)`,
        "i",
      );
      return pattern.test(lower);
    })
    .sort((a, b) => b.keyword.trim().length - a.keyword.trim().length)[0];

  if (keywordHit) {
    return {
      action: "reply",
      text: personalize(keywordHit.reply, fromName, rules.includeName),
      matchedRule: keywordHit.keyword,
    };
  }

  if (words.length <= 3 && words.every((word) => GREETING_WORDS.has(word.replace(/[!?.,]/g, "")))) {
    return {
      action: "reply",
      text: personalize(rules.greetingReply, fromName, rules.includeName),
      matchedRule: "greeting",
    };
  }

  return {
    action: "reply",
    text: personalize(rules.defaultReply, fromName, rules.includeName),
    matchedRule: "default",
  };
}
