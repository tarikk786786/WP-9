export type ResourceType =
  | "chat"
  | "message"
  | "customer"
  | "conversation"
  | "tool"
  | "skill"
  | "memory"
  | "knowledge"
  | "system_settings"
  | "admin";

export interface ResourceScope {
  type: ResourceType;
  id: string;
  tenantId?: string;
  chatId?: string;
  isPrivate?: boolean;
}

export function createChatResource(chatId: string, tenantId = "default"): ResourceScope {
  return { type: "chat", id: chatId, chatId, tenantId };
}

export function createMemoryResource(userId: string, isPrivate = false): ResourceScope {
  return { type: "memory", id: userId, isPrivate };
}

export function createToolResource(toolName: string): ResourceScope {
  return { type: "tool", id: toolName };
}

export function createAdminResource(): ResourceScope {
  return { type: "admin", id: "system_admin" };
}
