import { generateBestHumanReply } from "@bot/engine";
import { defaultBotSettings } from "@bot/shared";
import {
  isLowQualityReply,
  polishToHinglish,
  writeHinglishReply,
} from "@/lib/hinglish-brain";
import { generateLocalReply } from "@/lib/local-llm";
import { decideReply, isGreetingMessage, type ReplyDecision } from "@/lib/reply-engine";
import { inspectIncoming, isRateLimited, sanitizeOutgoing } from "@/lib/safety";
import { scheduleProfileRefresh } from "@/lib/tarik-profile";
import type { BotRules } from "@/lib/types";
import { applyVoice } from "@/lib/voice";

export type ComposedReply = ReplyDecision & { engine: string };

export async function composeReply(options: {
  text: string;
  fromName: string;
  fromId: string;
  rules: BotRules;
  now?: Date;
}): Promise<ComposedReply> {
  const { text, fromName, fromId, rules, now } = options;

  if (!rules.enabled) {
    return { action: "skip", reason: "Auto-reply is turned off.", engine: "off" };
  }
  scheduleProfileRefresh();

  if (!fromId.startsWith("sim:") && isRateLimited(fromId)) {
    return {
      action: "skip",
      reason: "Too many auto-replies to this contact in 10 minutes.",
      engine: "safety",
    };
  }

  const safety = inspectIncoming(text);
  if (safety.action === "skip") {
    return { action: "skip", reason: safety.reason, engine: "safety" };
  }
  if (safety.action === "safe-reply") {
    return {
      action: "reply",
      text: safety.text,
      matchedRule: "safety",
      engine: "safety",
    };
  }

  const fallback = decideReply(text, fromName, rules, now);
  if (fallback.action === "skip") {
    return { ...fallback, engine: "rules" };
  }

  const hint = fallback.matchedRule;
  const greeting = hint === "greeting" || isGreetingMessage(text);

  if (rules.replyMode === "greetings" && !greeting) {
    return { action: "skip", reason: "Only greetings are set to auto-reply.", engine: "mode" };
  }
  if (rules.replyMode === "keywords") {
    const isKeyword = rules.keywordRules.some((rule) => rule.enabled && rule.keyword === hint);
    if (!isKeyword) {
      return { action: "skip", reason: "Only keyword matches are set to auto-reply.", engine: "mode" };
    }
  }

  function finish(raw: string, matched: string, engine: string): ComposedReply {
    const clean = sanitizeOutgoing(applyVoice(raw, rules));
    if (!clean || isLowQualityReply(clean)) {
      return {
        action: "reply",
        text: sanitizeOutgoing(
          applyVoice(writeHinglishReply(text, fromName, rules, matched), rules),
        ),
        matchedRule: matched,
        engine: "tarik-live",
      };
    }
    return { action: "reply", text: clean, matchedRule: matched, engine };
  }

  const matched = greeting ? "greeting" : hint;
  const suggested = fallback.action === "reply" ? fallback.text : writeHinglishReply(text, fromName, rules, matched);

  if (rules.useLocalLlm !== false) {
    const settings = defaultBotSettings();
    settings.defaultLanguage = rules.language;
    try {
      const cloud = await generateBestHumanReply(
        {
          id: `sim_${Date.now()}`,
          whatsappMessageId: `sim_${Date.now()}`,
          sender: fromId,
          chatId: fromId,
          fromName,
          type: "text",
          text,
          timestamp: new Date().toISOString(),
          isGroup: false,
          metadata: {},
        },
        {
          settings,
          customerName: fromName,
          recent: [],
          faqs: [],
          knowledge: rules.customFacts ? [rules.customFacts] : [],
          intent: matched,
          suggested,
        },
      );
      if (cloud?.text) {
        return finish(polishToHinglish(cloud.text), matched, `${cloud.engine} · human`);
      }
    } catch {
      /* try local next */
    }

    try {
      const generated = await generateLocalReply(text, fromName, rules);
      return finish(polishToHinglish(generated.text), matched, `${generated.engine} · human`);
    } catch {
      /* human voice still answers */
    }
  }

  return finish(writeHinglishReply(text, fromName, rules, matched), matched, "tarik-live");
}
