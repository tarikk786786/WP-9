import type { ResourceScope } from "./resource-scope.ts";
import { getActionPermission, type PermissionLevel } from "./action-permissions.ts";

export type SubjectRole = "admin" | "special_contact" | "customer" | "ai_agent" | "system";

export interface AuthorizationSubject {
  id: string;
  role: SubjectRole;
  chatId?: string;
  isDazy?: boolean;
}

export interface PermissionCheckRequest {
  subject: AuthorizationSubject;
  action: string;
  resource: ResourceScope;
}

export interface PermissionDecision {
  allowed: boolean;
  reason: string;
  requiresConfirmation: boolean;
  requiredLevel: PermissionLevel;
}

export class RelationshipPermissionChecker {
  public check(req: PermissionCheckRequest): PermissionDecision {
    const { subject, action, resource } = req;
    const actionDef = getActionPermission(action);

    // 1. Check if subject role is in allowedRoles
    if (!actionDef.allowedRoles.includes(subject.role)) {
      return {
        allowed: false,
        reason: `Subject role '${subject.role}' is not authorized to execute action '${action}'.`,
        requiresConfirmation: false,
        requiredLevel: actionDef.requiredLevel,
      };
    }

    // 2. Resource scoping checks
    if (resource.type === "chat" && resource.chatId && subject.chatId) {
      // Ordinary customers cannot perform actions on other chats
      if (subject.role === "customer" && subject.chatId !== resource.chatId) {
        return {
          allowed: false,
          reason: "Cross-chat action execution denied for customer.",
          requiresConfirmation: false,
          requiredLevel: actionDef.requiredLevel,
        };
      }
    }

    // 3. Private memory check
    if (resource.type === "memory" && resource.isPrivate) {
      if (!subject.isDazy && subject.role !== "admin") {
        return {
          allowed: false,
          reason: "Access to private contact memory is denied.",
          requiresConfirmation: false,
          requiredLevel: actionDef.requiredLevel,
        };
      }
    }

    // 4. Admin actions
    if (actionDef.requiredLevel === "admin" && subject.role !== "admin") {
      return {
        allowed: false,
        reason: "Administrative privileges required.",
        requiresConfirmation: false,
        requiredLevel: actionDef.requiredLevel,
      };
    }

    return {
      allowed: true,
      reason: "Action authorized under relationship policy.",
      requiresConfirmation: Boolean(actionDef.requiresConfirmation),
      requiredLevel: actionDef.requiredLevel,
    };
  }
}

export const permissionChecker = new RelationshipPermissionChecker();
