import { isLowQualityReply, polishToHinglish, writeHinglishReply } from "@/lib/hinglish-brain";
import { generateLocalReply } from "@/lib/local-llm";
import { decideReply, type ReplyDecision } from "@/lib/reply-engine";
import { inspectIncoming, isRateLimited, sanitizeOutgoing } from "@/lib/safety";
import type { BotRules } from "@/lib/types";

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
  if (isRateLimited(fromId)) {
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

  if (hint === "greeting" || hint === "after-hours") {
    return {
      action: "reply",
      text: sanitizeOutgoing(writeHinglishReply(text, fromName, rules, hint)),
      matchedRule: hint,
      engine: "hinglish-live",
    };
  }

  if (rules.useLocalLlm !== false) {
    try {
      const generated = await generateLocalReply(text, fromName, rules);
      const polished = polishToHinglish(generated.text, fromName);
      const clean = sanitizeOutgoing(polished);
      if (clean && !isLowQualityReply(clean)) {
        return {
          action: "reply",
          text: clean,
          matchedRule: hint,
          engine: `${generated.engine} · hinglish`,
        };
      }
    } catch {
      // Always-live Hinglish voice still answers.
    }
  }

  return {
    action: "reply",
    text: sanitizeOutgoing(writeHinglishReply(text, fromName, rules, hint)),
    matchedRule: hint,
    engine: "hinglish-live",
  };
}
