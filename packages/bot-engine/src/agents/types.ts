import type { NormalizedMessage } from "@bot/shared";
import type { ToolRegistry } from "../tools/index.ts";

export type AgentRole = "supervisor" | "sales" | "support" | "billing" | "booking" | "general";

export interface AgentContext {
  message: NormalizedMessage;
  history: Array<{ role: "user" | "assistant"; text: string }>;
  customer?: {
    phone: string;
    name?: string;
    tier?: string;
    tags?: string[];
    knownFacts?: Record<string, unknown>;
  };
  intent: string;
  sentiment?: "positive" | "neutral" | "negative" | "frustrated";
  urgency?: "low" | "medium" | "high" | "urgent";
  tools: ToolRegistry;
  knowledgeHits?: string[];
}

export interface AgentDecision {
  action: "reply" | "handoff" | "delegate" | "tool_call" | "skip";
  targetAgent?: AgentRole;
  text?: string;
  handoffReason?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  confidence: number;
  explanation: string;
}

export interface SpecialistAgent {
  readonly role: AgentRole;
  canHandle(context: AgentContext): boolean;
  execute(context: AgentContext): Promise<AgentDecision>;
}
