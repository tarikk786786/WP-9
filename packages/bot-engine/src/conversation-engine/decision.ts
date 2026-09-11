import type { CanonicalContext } from "./context.ts";

export type ShouldReplyDecision =
  | "REPLY"
  | "DO_NOT_REPLY"
  | "ESCALATE"
  | "WAIT"
  | "IGNORE"
  | "DUPLICATE";

export interface DecisionResult {
  decision: ShouldReplyDecision;
  reason: string;
  escalateStatus?: "waiting_human" | "human";
}

export class DecisionEngine {
  public evaluate(context: CanonicalContext): DecisionResult {
    const { settings, status, understanding, turn } = context;

    // Invariant 1: Master Bot Switch
    if (settings.enabled === false) {
      return {
        decision: "DO_NOT_REPLY",
        reason: "Bot is disabled in settings",
      };
    }

    // Invariant 2: Authoritative Human Handoff Mode Check
    if (status !== "bot") {
      return {
        decision: "DO_NOT_REPLY",
        reason: `Conversation is currently in ${status} mode. Bot must remain completely silent.`,
      };
    }

    // Invariant 3: Explicit Human Escalation Request
    if (understanding.wantsHuman) {
      return {
        decision: "ESCALATE",
        reason: "User explicitly requested human/agent assistance",
        escalateStatus: "waiting_human",
      };
    }

    // Invariant 4: Ignore empty or junk messages
    if (!turn.combinedText.trim()) {
      return {
        decision: "IGNORE",
        reason: "Empty text",
      };
    }

    return {
      decision: "REPLY",
      reason: "Eligible for standard automated conversation reply",
    };
  }
}

export const decisionEngine = new DecisionEngine();
