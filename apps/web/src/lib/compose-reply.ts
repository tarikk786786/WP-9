import {
  isLowQualityReply,
  isOwnerFactQuestion,
  polishToHinglish,
  writeHinglishReply,
} from "@/lib/hinglish-brain";
import { generateLocalReply } from "@/lib/local-llm";
import { decideReply, isGreetingMessage, type ReplyDecision } from "@/lib/reply-engine";
import { inspectIncoming, isRateLimited, sanitizeOutgoing } from "@/lib/safety";
import { scheduleProfileRefresh } from "@/lib/tarik-profile";
import type { BotRules } from "@/lib/types";
import { applyVoice } from "@/lib/voice";
import { isServerlessDisk } from "@/lib/writable-dir";

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

  if (
    greeting ||
    hint === "after-hours" ||
    hint === "hours" ||
    hint === "price" ||
    hint === "hello" ||
    hint === "hi" ||
    isOwnerFactQuestion(text) ||
    hint !== "default"
  ) {
    return finish(
      writeHinglishReply(text, fromName, rules, greeting ? "greeting" : hint),
      greeting ? "greeting" : hint,
      "tarik-live",
    );
  }

  if (rules.useLocalLlm !== false && !isServerlessDisk()) {
    try {
      const generated = await generateLocalReply(text, fromName, rules);
      const polished = polishToHinglish(generated.text);
      return finish(polished, hint, `${generated.engine} · hinglish`);
    } catch {
      // Human voice still answers.
    }
  }

  return finish(writeHinglishReply(text, fromName, rules, hint), hint, "tarik-live");
}
