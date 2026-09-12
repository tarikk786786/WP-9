export type ActionVerb =
  | "ANSWER"
  | "ASK"
  | "SEARCH"
  | "OPEN"
  | "CALCULATE"
  | "REMEMBER"
  | "FORGET"
  | "SCHEDULE"
  | "SEND"
  | "UPDATE"
  | "CREATE"
  | "DELETE"
  | "ESCALATE"
  | "WAIT"
  | "CONFIRM";

export interface ActionPlan {
  actionId: string;
  verb: ActionVerb;
  targetResource: string;
  parameters: Record<string, unknown>;
  requiresConfirmation: boolean;
  confirmationPrompt?: string;
  priority: number;
}

export interface ActionResult {
  actionId: string;
  verb: ActionVerb;
  success: boolean;
  output?: unknown;
  error?: string;
  confirmed?: boolean;
  executedAt: number;
}
