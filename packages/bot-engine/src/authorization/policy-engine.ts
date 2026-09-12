import type { PermissionCheckRequest, PermissionDecision } from "./permission-check.ts";
import { permissionChecker } from "./permission-check.ts";

export interface PolicyContext {
  botEnabled: boolean;
  conversationStatus: string; // "bot" | "human" | "waiting_human" | "paused" | "closed"
  isQuietHours?: boolean;
  confirmed?: boolean;
  recentActionCount?: number;
  maxRecentActions?: number;
  isExternalRecipient?: boolean;
}

export interface PolicyDecision {
  allowed: boolean;
  reason: string;
  requiresConfirmation: boolean;
  ruleMatched?: string;
}

export class PolicyEngine {
  public evaluate(req: PermissionCheckRequest, ctx: PolicyContext): PolicyDecision {
    // 1. First run OpenFGA relationship permission check
    const permDecision = permissionChecker.check(req);
    if (!permDecision.allowed) {
      return {
        allowed: false,
        reason: permDecision.reason,
        requiresConfirmation: false,
        ruleMatched: "permission_denied",
      };
    }

    // 2. Policy: Bot disabled
    if (!ctx.botEnabled && req.action === "send_message") {
      return {
        allowed: false,
        reason: "Bot is globally disabled in settings.",
        requiresConfirmation: false,
        ruleMatched: "bot_disabled_policy",
      };
    }

    // 3. Policy: Human handoff
    if (
      (ctx.conversationStatus === "human" ||
        ctx.conversationStatus === "waiting_human" ||
        ctx.conversationStatus === "paused") &&
      req.action === "send_message" &&
      req.subject.role === "ai_agent"
    ) {
      return {
        allowed: false,
        reason: `Conversation is in '${ctx.conversationStatus}' mode. AI automated replies are suspended.`,
        requiresConfirmation: false,
        ruleMatched: "human_handoff_policy",
      };
    }

    // 4. Policy: Flood / Rate Limit
    if (ctx.recentActionCount && ctx.maxRecentActions && ctx.recentActionCount >= ctx.maxRecentActions) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${ctx.recentActionCount} actions in recent window.`,
        requiresConfirmation: false,
        ruleMatched: "rate_limit_policy",
      };
    }

    // 5. Policy: Confirmation required for sensitive actions
    if (permDecision.requiresConfirmation && !ctx.confirmed) {
      return {
        allowed: false,
        reason: `Action '${req.action}' requires explicit user confirmation before execution.`,
        requiresConfirmation: true,
        ruleMatched: "confirmation_required_policy",
      };
    }

    // 6. Policy: External untrusted recipient check
    if (ctx.isExternalRecipient && !ctx.confirmed) {
      return {
        allowed: false,
        reason: "Sending to an external unverified recipient requires explicit confirmation.",
        requiresConfirmation: true,
        ruleMatched: "external_recipient_policy",
      };
    }

    return {
      allowed: true,
      reason: "Action conforms to all business safety and operational policies.",
      requiresConfirmation: false,
      ruleMatched: "policy_allow",
    };
  }
}

export const policyEngine = new PolicyEngine();
