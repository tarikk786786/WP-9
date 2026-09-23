import type { SpecialistAgent, AgentContext, AgentDecision } from "./types.ts";

export class SupportAgent implements SpecialistAgent {
  readonly role = "support" as const;

  public canHandle(context: AgentContext): boolean {
    const text = context.message.text.toLowerCase();
    const isIssue = /\b(issue|problem|bug|error|not working|fail|crash|kharab|nahi chal raha|downtime|stuck|glitch)\b/i.test(text);
    const isHandoff = /\b(human|agent|person|insaan|real person|manager|talk to someone|baat karni hai)\b/i.test(text);
    return isIssue || isHandoff || context.intent === "support" || context.sentiment === "frustrated";
  }

  public async execute(context: AgentContext): Promise<AgentDecision> {
    const text = context.message.text.trim();
    const lower = text.toLowerCase();

    // Check if user is asking for human escalation
    if (/\b(human|agent|person|insaan|manager|talk to someone)\b/i.test(lower)) {
      return {
        action: "handoff",
        handoffReason: "User requested human agent escalation",
        text: "Ji bilkul, main conversation Tarik bhai / team ko transfer kar raha hoon. Thoda waqt dijiye, direct connect karte hain.",
        confidence: 0.99,
        explanation: "Direct user request for human handoff",
      };
    }

    // High frustration or severe failure
    if (context.sentiment === "frustrated" || context.urgency === "urgent") {
      // Create support ticket via tool
      const ticketResult = await context.tools.executeTool("support_ticket", {
        jid: context.message.sender,
        summary: text,
        priority: "urgent",
      });

      return {
        action: "reply",
        text: "Main samajh sakta hoon pareshani. Maine is issue ko high priority ticket mein mark kar diya hai. Tarik bhai personally review karke update karenge.",
        confidence: 0.95,
        explanation: "Logged urgent ticket for frustrated customer",
      };
    }

    // Standard technical problem
    if (/\b(login|password|auth|otp|access)\b/i.test(lower)) {
      return {
        action: "reply",
        text: "Authentication ya login issue ke liye browser cache clear karke incognito mein check karein. Agar phir bhi problem ho toh error screenshot bhej dijiye.",
        confidence: 0.90,
        explanation: "Provided standard authentication triage instructions",
      };
    }

    return {
      action: "reply",
      text: "Issue samajh gaya. Thoda detail ya error screenshot share kar dijiye taaki hum turant diagnose kar sakein.",
      confidence: 0.85,
      explanation: "Requested diagnostic information for technical issue",
    };
  }
}
