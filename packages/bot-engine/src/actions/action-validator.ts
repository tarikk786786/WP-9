import type { ActionPlan } from "./action-types.ts";
import { policyEngine, type PolicyContext } from "../authorization/policy-engine.ts";
import type { AuthorizationSubject } from "../authorization/permission-check.ts";
import { createToolResource, createChatResource } from "../authorization/resource-scope.ts";

export interface ActionValidationResult {
  valid: boolean;
  reason: string;
  requiresConfirmation: boolean;
}

export class ActionValidator {
  public validate(
    plan: ActionPlan,
    subject: AuthorizationSubject,
    policyCtx: PolicyContext,
  ): ActionValidationResult {
    const resource =
      plan.verb === "SEND" || plan.verb === "ANSWER"
        ? createChatResource(subject.chatId || "default")
        : createToolResource(plan.targetResource);

    // Map verb to action name
    const actionName =
      plan.verb === "SEND"
        ? "send_document"
        : plan.verb === "CALCULATE"
          ? "calculate"
          : plan.verb === "SEARCH"
            ? "search_web"
            : "send_message";

    const decision = policyEngine.evaluate(
      {
        subject,
        action: actionName,
        resource,
      },
      policyCtx,
    );

    return {
      valid: decision.allowed,
      reason: decision.reason,
      requiresConfirmation: decision.requiresConfirmation || plan.requiresConfirmation,
    };
  }
}

export const actionValidator = new ActionValidator();
