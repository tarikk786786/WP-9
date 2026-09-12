export type PermissionLevel = "read" | "execute" | "write" | "delete" | "admin";

export interface ActionPermissionDef {
  actionName: string;
  requiredLevel: PermissionLevel;
  requiresConfirmation?: boolean;
  allowedRoles: Array<"admin" | "special_contact" | "customer" | "ai_agent" | "system">;
}

export const ACTION_PERMISSIONS: Record<string, ActionPermissionDef> = {
  // Read / Public Actions
  "read_knowledge": {
    actionName: "read_knowledge",
    requiredLevel: "read",
    allowedRoles: ["admin", "special_contact", "customer", "ai_agent", "system"],
  },
  "search_web": {
    actionName: "search_web",
    requiredLevel: "read",
    allowedRoles: ["admin", "special_contact", "customer", "ai_agent", "system"],
  },
  "calculate": {
    actionName: "calculate",
    requiredLevel: "execute",
    allowedRoles: ["admin", "special_contact", "customer", "ai_agent", "system"],
  },
  "get_weather": {
    actionName: "get_weather",
    requiredLevel: "read",
    allowedRoles: ["admin", "special_contact", "customer", "ai_agent", "system"],
  },

  // WhatsApp Conversational Actions
  "send_message": {
    actionName: "send_message",
    requiredLevel: "execute",
    allowedRoles: ["admin", "ai_agent", "system"],
  },
  "send_document": {
    actionName: "send_document",
    requiredLevel: "execute",
    requiresConfirmation: true, // Requires confirmation before sending files
    allowedRoles: ["admin", "special_contact", "ai_agent", "system"],
  },

  // Sensitive & Admin Actions
  "delete_conversation": {
    actionName: "delete_conversation",
    requiredLevel: "delete",
    requiresConfirmation: true,
    allowedRoles: ["admin"],
  },
  "update_settings": {
    actionName: "update_settings",
    requiredLevel: "admin",
    requiresConfirmation: true,
    allowedRoles: ["admin"],
  },
  "access_private_memory": {
    actionName: "access_private_memory",
    requiredLevel: "read",
    allowedRoles: ["admin", "special_contact"],
  },
  "run_browser_action": {
    actionName: "run_browser_action",
    requiredLevel: "execute",
    requiresConfirmation: true, // Browser actions are sensitive
    allowedRoles: ["admin", "special_contact", "ai_agent"],
  },
};

export function getActionPermission(actionName: string): ActionPermissionDef {
  return (
    ACTION_PERMISSIONS[actionName] ?? {
      actionName,
      requiredLevel: "admin",
      requiresConfirmation: true,
      allowedRoles: ["admin"],
    }
  );
}
