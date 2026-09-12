import type { ActionPlan, ActionResult } from "./action-types.ts";

export class ActionExecutor {
  public async execute(plan: ActionPlan, confirmed = false): Promise<ActionResult> {
    const executedAt = Date.now();

    if (plan.requiresConfirmation && !confirmed) {
      return {
        actionId: plan.actionId,
        verb: plan.verb,
        success: false,
        error: "Execution blocked: explicit user confirmation required.",
        confirmed: false,
        executedAt,
      };
    }

    try {
      let output: unknown = null;

      switch (plan.verb) {
        case "CALCULATE": {
          const expr = String(plan.parameters.expression || "");
          const match = expr.match(/(\d+(?:\.\d+)?)\s*([\+\-\*\/])\s*(\d+(?:\.\d+)?)/);
          if (match) {
            const a = parseFloat(match[1]);
            const op = match[2];
            const b = parseFloat(match[3]);
            let res = 0;
            if (op === "+") res = a + b;
            else if (op === "-") res = a - b;
            else if (op === "*") res = a * b;
            else if (op === "/" && b !== 0) res = a / b;
            output = { result: res };
          }
          break;
        }

        case "SCHEDULE": {
          output = { scheduled: true, details: plan.parameters };
          break;
        }

        case "SEND": {
          output = { dispatched: true, document: plan.parameters.rawRequest };
          break;
        }

        default: {
          output = { status: "processed", verb: plan.verb };
          break;
        }
      }

      return {
        actionId: plan.actionId,
        verb: plan.verb,
        success: true,
        output,
        confirmed,
        executedAt,
      };
    } catch (err) {
      return {
        actionId: plan.actionId,
        verb: plan.verb,
        success: false,
        error: err instanceof Error ? err.message : String(err),
        confirmed,
        executedAt,
      };
    }
  }
}

export const actionExecutor = new ActionExecutor();
