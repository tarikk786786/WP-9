import type { AutomationRule, BotSettings, Faq, NormalizedMessage } from "@bot/shared";
import type { BotDecision } from "@bot/shared";
import { analyzeMessage } from "./ai/analyze.ts";
import { writeCompleteFallback } from "./ai/fallback.ts";
import { isCannedFallback, writeSpokenReply } from "./orchestrate/spoken.ts";

const COMMANDS = /^(help|stop|start|menu)$/i;
const HANDOFF =
  /\b(talk to (a )?(human|person|real agent)|human agent|real (agent|person)|kisi (insaan|agent) se|insaan se baat)\b/i;

export function isWithinBusinessHours(settings: BotSettings, now = new Date()): boolean {
  const hours = settings.businessHours;
  if (!hours.enabled) return true;
  let weekday = 0;
  let hm = "00:00";
  try {
    weekday = Number(
      new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: hours.days ? settings.timezone : settings.timezone }).formatToParts(now)
        ? new Intl.DateTimeFormat("en-US", { timeZone: settings.timezone, weekday: "narrow" }).format(now)
        : 0,
    );
  } catch {
    weekday = now.getUTCDay();
  }
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: settings.timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const wd = parts.find((p) => p.type === "weekday")?.value;
    const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    weekday = map[wd ?? ""] ?? now.getDay();
    const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
    const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
    hm = `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  } catch {
    hm = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;
    weekday = now.getUTCDay();
  }
  if (!hours.days.includes(weekday)) return false;
  return hm >= hours.open && hm < hours.close;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function matchRule(text: string, rules: AutomationRule[]): AutomationRule | null {
  const lower = text.toLowerCase();
  const enabled = rules.filter((r) => r.enabled).sort((a, b) => a.priority - b.priority);
  for (const rule of enabled) {
    const needle = rule.triggerValue.trim();
    if (!needle) continue;
    if (rule.triggerType === "exact" && lower === needle.toLowerCase()) return rule;
    if (rule.triggerType === "contains" && lower.includes(needle.toLowerCase())) return rule;
    if (rule.triggerType === "keyword") {
      const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(needle)}([^a-z0-9]|$)`, "i");
      if (pattern.test(lower)) return rule;
    }
    if (rule.triggerType === "regex") {
      try {
        if (new RegExp(needle, "i").test(text) && needle.length < 80) return rule;
      } catch {
        continue;
      }
    }
  }
  return null;
}

export function matchFaq(text: string, faqs: Faq[]): Faq | null {
  return matchAllFaqs(text, faqs)[0] ?? null;
}

export function matchAllFaqs(text: string, faqs: Faq[]): Faq[] {
  const lower = text.toLowerCase();
  return faqs
    .filter((f) => f.enabled)
    .sort((a, b) => a.priority - b.priority)
    .filter((faq) => {
      if (lower.includes(faq.question.toLowerCase())) return true;
      return faq.keywords.some((k) => k && lower.includes(k.toLowerCase()));
    });
}

export function matchAllRules(text: string, rules: AutomationRule[]): AutomationRule[] {
  const lower = text.toLowerCase();
  const enabled = rules.filter((r) => r.enabled).sort((a, b) => a.priority - b.priority);
  const hits: AutomationRule[] = [];
  for (const rule of enabled) {
    const needle = rule.triggerValue.trim();
    if (!needle) continue;
    if (rule.triggerType === "exact" && lower === needle.toLowerCase()) hits.push(rule);
    else if (rule.triggerType === "contains" && lower.includes(needle.toLowerCase())) hits.push(rule);
    else if (rule.triggerType === "keyword") {
      const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(needle)}([^a-z0-9]|$)`, "i");
      if (pattern.test(lower)) hits.push(rule);
    } else if (rule.triggerType === "regex") {
      try {
        if (new RegExp(needle, "i").test(text) && needle.length < 80) hits.push(rule);
      } catch {
        continue;
      }
    }
  }
  return hits;
}

export function routeMessage(input: {
  message: NormalizedMessage;
  settings: BotSettings;
  rules: AutomationRule[];
  faqs: Faq[];
  conversationStatus: "bot" | "waiting_human" | "human" | "closed";
  knowledgeHits?: string[];
  aiReply?: string | null;
}): BotDecision {
  const { message, settings, rules, faqs, knowledgeHits, aiReply } = input;
  if (!settings.enabled) {
    return { action: "skip", text: "", source: "skip", intent: "disabled" };
  }
  if (message.isGroup && !settings.replyToGroups) {
    return { action: "skip", text: "", source: "skip", intent: "group" };
  }

  const text = message.text.trim();
  if (COMMANDS.test(text)) {
    return { action: "reply", text: settings.welcomeMessage, source: "command", intent: "help" };
  }
  if (HANDOFF.test(text)) {
    return { action: "reply", text: settings.humanHandoffMessage, source: "handoff", intent: "human" };
  }

  if (!isWithinBusinessHours(settings)) {
    return { action: "reply", text: settings.businessHours.afterHoursMessage, source: "hours", intent: "after-hours" };
  }

  if (!text && message.type !== "text") {
    return { action: "reply", text: "haan bhai, aa gaya. text mein likh do kya chahiye", source: "fallback" };
  }

  const analysis = analyzeMessage(text, { isFirstMessage: true });
  const exclusiveCanned = !analysis.wantsAllAnswers && analysis.complexity !== "lead";

  const rule = matchRule(text, rules);
  if (rule && exclusiveCanned) {
    if (/agent|human/.test(rule.triggerValue)) {
      return { action: "handoff", text: settings.humanHandoffMessage, source: "handoff" };
    }
    return { action: "reply", text: rule.response, source: "rule", intent: rule.id };
  }

  if (settings.faqEnabled && exclusiveCanned) {
    const faq = matchFaq(text, faqs);
    if (faq) return { action: "reply", text: faq.answer, source: "faq", intent: faq.id };
  }

  if (knowledgeHits?.length && exclusiveCanned) {
    return {
      action: "reply",
      text: knowledgeHits[0].slice(0, 220),
      source: "knowledge",
    };
  }

  if (settings.aiEnabled && aiReply) {
    return { action: "reply", text: aiReply.slice(0, 400), source: "ai" };
  }

  if (settings.welcomeEnabled && /^(hi|hello|hey|yo)[\s!?.]*$/i.test(text)) {
    return { action: "reply", text: settings.welcomeMessage, source: "rule", intent: "welcome" };
  }

  const complete = writeCompleteFallback(analysis, knowledgeHits ?? [], text);
  const spoken = writeSpokenReply(text, analysis);
  const cannedSettings = isCannedFallback(settings.fallbackMessage);
  return {
    action: "reply",
    text: !isCannedFallback(complete) ? complete : cannedSettings ? spoken : settings.fallbackMessage,
    source: "fallback",
  };
}
