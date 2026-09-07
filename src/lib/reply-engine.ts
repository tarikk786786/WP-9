import type { BotRules } from "@/lib/types";

export type ReplyDecision =
  | { action: "skip"; reason: string }
  | { action: "reply"; text: string; matchedRule: string };

const GREETING_WORDS = new Set([
  "hi",
  "hello",
  "hey",
  "hola",
  "salam",
  "salaam",
  "yo",
  "namaste",
  "namaskar",
  "hii",
  "helo",
  "heloo",
  "hlo",
  "hlw",
  "gm",
  "gn",
  "bro",
  "bhai",
]);

export function isGreetingMessage(incoming: string) {
  const lower = incoming.trim().toLowerCase();
  if (!lower) return false;
  if (
    /^(ass?alam(u)?[ -]?alaikum|salam(ualaikum)?|good (morning|evening|afternoon|night)|kaise ho|kya haal( hai)?|whats? ?up|how are you)[\s!?.]*$/i.test(
      lower,
    )
  ) {
    return true;
  }
  const words = lower.split(/\s+/).map((word) => word.replace(/[!?.,]/g, ""));
  return words.length <= 4 && words.every((word) => GREETING_WORDS.has(word));
}

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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function decideReply(
  incoming: string,
  _fromName: string,
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

  if (isGreetingMessage(body)) {
    return {
      action: "reply",
      text: rules.greetingReply,
      matchedRule: "greeting",
    };
  }

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
      text: keywordHit.reply,
      matchedRule: keywordHit.keyword,
    };
  }

  return {
    action: "reply",
    text: rules.defaultReply,
    matchedRule: "default",
  };
}
