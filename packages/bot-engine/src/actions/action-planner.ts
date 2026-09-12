import type { ActionPlan, ActionVerb } from "./action-types.ts";

export class ActionPlanner {
  public planAction(text: string, context?: { isDazy?: boolean; senderName?: string }): ActionPlan {
    const clean = text.trim().toLowerCase();
    const actionId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // 1. Calculations
    if (/\b(\d+\s*[\+\-\*\/]\s*\d+|calculate|kitna hua|sum of|multiply)\b/i.test(clean)) {
      return {
        actionId,
        verb: "CALCULATE",
        targetResource: "calculator_tool",
        parameters: { expression: text },
        requiresConfirmation: false,
        priority: 80,
      };
    }

    // 2. Scheduling & Reminders
    if (/\b(yaad dila|remind me|schedule|alarm|kal subah|baje)\b/i.test(clean)) {
      return {
        actionId,
        verb: "SCHEDULE",
        targetResource: "calendar_reminder",
        parameters: { rawRequest: text },
        requiresConfirmation: false,
        priority: 75,
      };
    }

    // 3. Document / File send requests (Sensitive: requires confirmation)
    if (/\b(file bhej|document bhej|send document|share pdf|send resume|send invoice)\b/i.test(clean)) {
      return {
        actionId,
        verb: "SEND",
        targetResource: "document_service",
        parameters: { rawRequest: text },
        requiresConfirmation: true,
        confirmationPrompt: context?.isDazy
          ? "Kya main ye document share kar doon meri jaan? ❤️"
          : "Kya aap chahte hain ki main ye document send karoon? Kripya confirm kijiye.",
        priority: 70,
      };
    }

    // 4. Memory Retention
    if (/\b(yaad rakhna|remember this|save note|mera number note kar)\b/i.test(clean)) {
      return {
        actionId,
        verb: "REMEMBER",
        targetResource: "memory_store",
        parameters: { note: text },
        requiresConfirmation: false,
        priority: 60,
      };
    }

    // 5. Web Search / Fact Research
    if (/\b(weather|baarish|gold price|latest news|aaj ka rate|score)\b/i.test(clean)) {
      return {
        actionId,
        verb: "SEARCH",
        targetResource: "web_intelligence",
        parameters: { query: text },
        requiresConfirmation: false,
        priority: 65,
      };
    }

    // Default conversational answer
    return {
      actionId,
      verb: "ANSWER",
      targetResource: "conversation_brain",
      parameters: { text },
      requiresConfirmation: false,
      priority: 50,
    };
  }
}

export const actionPlanner = new ActionPlanner();
