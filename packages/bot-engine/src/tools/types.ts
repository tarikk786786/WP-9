export type ToolCategory =
  | "whatsapp"
  | "understanding"
  | "memory"
  | "information"
  | "productivity"
  | "business"
  | "agent"
  | "system";

export type ToolParameter = {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  description: string;
  required?: boolean;
  enum?: string[];
  default?: unknown;
};

export type ToolDefinition<TArgs = Record<string, unknown>, TResult = unknown> = {
  name: string;
  category: ToolCategory;
  description: string;
  parameters: ToolParameter[];
  execute: (args: TArgs, context: ToolContext) => Promise<ToolResult<TResult>>;
};

export type ToolContext = {
  chatJid?: string;
  senderPhone?: string;
  contactName?: string;
  rawMessage?: unknown;
  supabaseClient?: unknown;
  workerApiUrl?: string;
  workerApiSecret?: string;
};

export type ToolResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
  summary?: string;
};
