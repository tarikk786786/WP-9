import { NextResponse } from "next/server";
import { z } from "zod";
import {
  resolveContactIdentity,
  policyEngine,
  permissionChecker,
  createChatResource,
  type PermissionCheckRequest,
  type SubjectRole,
  normalizeDazySpelling,
  conversationStateManager,
  fatigueEngine,
  questionDecisionEngine,
  skillsRegistry,
  personalityEngine,
  actionPlanner,
  confirmationEngine,
  qualityGate,
  TARIK_PUBLIC_FACTS,
} from "@bot/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ChatPayloadSchema = z.object({
  message: z.string().min(1, "Message cannot be empty"),
  senderId: z.string().optional().default("sim:anonymous"),
  senderName: z.string().optional().default("Guest"),
  role: z.enum(["customer", "special_contact", "admin", "ai_agent", "system"]).optional(),
  includeTelemetry: z.boolean().optional().default(true),
});

export async function POST(request: Request) {
  const startTime = Date.now();
  try {
    const rawBody = await request.json();
    const parseResult = ChatPayloadSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid request payload",
          details: parseResult.error.format(),
        },
        { status: 400 },
      );
    }

    const { message, senderId, senderName, role } = parseResult.data;

    // 1. Contact Identity Resolution
    const contactIdentity = resolveContactIdentity(senderId, senderName);
    const effectiveRole: SubjectRole =
      role ||
      (contactIdentity.relationship === "romantic_partner"
        ? "special_contact"
        : contactIdentity.relationship === "admin"
          ? "admin"
          : "customer");

    // 2. Authorization & Policy Gate (AI agent executes outbound reply)
    const agentPermReq: PermissionCheckRequest = {
      subject: {
        id: "wp9-assistant",
        role: "ai_agent",
        isDazy: contactIdentity.isDazy,
        chatId: contactIdentity.contactId,
      },
      action: "send_message",
      resource: createChatResource(contactIdentity.contactId),
    };

    const policyDecision = policyEngine.evaluate(agentPermReq, {
      botEnabled: true,
      conversationStatus: "bot",
      isQuietHours: false,
    });

    if (!policyDecision.allowed) {
      return NextResponse.json(
        {
          ok: true,
          reply: null,
          skippedReason: policyDecision.reason || "Policy denied",
          allowed: false,
        },
        { status: 200 },
      );
    }

    // 3. Normalization (Spelling Intelligence)
    const isSpecialRomantic = contactIdentity.relationship === "romantic_partner";
    const normalizedText = isSpecialRomantic ? normalizeDazySpelling(message) : message;

    // 4. Conversation State & Operational Intelligence
    const convState = conversationStateManager.updateState(contactIdentity.contactId, {
      conversationMode: isSpecialRomantic ? "ROMANTIC" : "CASUAL",
      emotion: isSpecialRomantic ? "affectionate" : "neutral",
    });
    const fatigue = fatigueEngine.evaluateFatigue(contactIdentity.contactId, normalizedText);
    const strategy = questionDecisionEngine.evaluate(normalizedText);

    // 5. Action Planner & Two-Phase Confirmation
    const plannedAction = actionPlanner.planAction(normalizedText);
    let confirmationRequired = false;
    let confirmationPrompt: string | undefined;

    if (plannedAction.requiresConfirmation) {
      const entry = confirmationEngine.registerPending(
        `chat_${contactIdentity.contactId}`,
        plannedAction,
      );
      confirmationRequired = true;
      confirmationPrompt = entry.plan.confirmationPrompt || "Should I proceed with this action?";
    }

    // 6. Specialist Skills Dispatching
    let replyText = "";
    let matchedSkill = "AdaptiveVoice";

    const executedSkill = await skillsRegistry.evaluate({
      chatId: contactIdentity.contactId,
      sender: contactIdentity.contactId,
      fromName: contactIdentity.displayName,
      rawText: message,
      normalizedText: normalizedText,
      intent: "inquiry",
      emotion: isSpecialRomantic ? "romantic" : "neutral",
      isDazy: isSpecialRomantic,
      history: [],
      verifiedFacts: Object.values(TARIK_PUBLIC_FACTS),
    });

    if (executedSkill && executedSkill.replyText) {
      replyText = executedSkill.replyText;
      matchedSkill = executedSkill.skillId;
    } else {
      // Direct adaptive fallback
      replyText = isSpecialRomantic
        ? "haan sun raha hoon, bolo na kya keh rahi thi."
        : "haan ji, batayein main kaise madad kar sakta hoon?";
      matchedSkill = "AdaptiveVoice";
    }

    // If confirmation was required, present confirmation prompt
    if (confirmationRequired && confirmationPrompt) {
      replyText = confirmationPrompt;
      matchedSkill = "ConfirmationEngine";
    }

    // 7. Adaptive Personality Tuning
    const personality = personalityEngine.calibrate({
      isDazy: isSpecialRomantic,
      emotion: isSpecialRomantic ? "romantic" : "neutral",
      emotionIntensity: isSpecialRomantic ? 4 : 1,
      messageLength: message.length,
    });

    // 8. Human Language Quality Gate
    const qualityAudit = qualityGate.audit(replyText, [], {
      rawUserInput: message,
      isDazy: isSpecialRomantic,
    });

    const latencyMs = Date.now() - startTime;

    return NextResponse.json({
      ok: true,
      reply: qualityAudit.sanitizedText || replyText,
      metadata: {
        contact: {
          id: contactIdentity.contactId,
          name: contactIdentity.displayName,
          relationship: contactIdentity.relationship,
          tone: contactIdentity.profile.tone,
          warmth: contactIdentity.profile.warmth,
        },
        mode: convState.conversationMode,
        fatigue: {
          isFatigued: fatigue.isFatigued,
          suggestedReply: fatigue.suggestedReply,
        },
        strategy: strategy.decision,
        skill: matchedSkill,
        personality: {
          warmth: personality.warmth,
          formality: personality.formality,
          humor: personality.humor,
        },
        quality: {
          passed: qualityAudit.passed,
          humilityScore: qualityAudit.scores?.humility ?? 100,
          naturalnessScore: qualityAudit.scores?.naturalness ?? 100,
        },
        latencyMs,
      },
    });
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.stack || error.message : "Internal error",
        latencyMs,
      },
      { status: 500 },
    );
  }
}
