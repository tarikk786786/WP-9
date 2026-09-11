import type { UnderstandingResult, ConversationHistoryEntry } from "../understanding/index.ts";

export interface ResponsePlan {
  action: "direct_answer" | "empathy_and_support" | "repair_acknowledgment" | "clarification" | "playful_casual";
  targetTone: string;
  keyPoints: string[];
  suggestedDraft?: string;
}

export interface ResponseQualityCheck {
  passed: boolean;
  sanitizedText: string;
  reasons: string[];
}

export interface CommittedResponse {
  responseId: string;
  turnId: string;
  tenantId: string;
  chatId: string;
  text: string;
  aiGenerated: boolean;
  intent: string;
  plan: ResponsePlan;
  committedAt: number;
}

export class ResponsePlanner {
  public plan(
    understanding: UnderstandingResult,
    context: {
      recent?: ConversationHistoryEntry[];
      knowledge?: string[];
      hasMultipleOptions?: boolean;
    }
  ): ResponsePlan {
    const { emotion, isRepair, primaryIntent, resolvedQuotedContext, resolvedPronouns } = understanding;

    // 1. Repair Plan
    if (isRepair) {
      return {
        action: "repair_acknowledgment",
        targetTone: "apologetic_helpful",
        keyPoints: [
          `Acknowledge error politely (e.g. "Acha samjha, meri galti")`,
          `Address user's actual question: ${understanding.repairDetails?.correction ?? understanding.normalizedText}`,
        ],
      };
    }

    // 2. Emotion / Venting Plan
    if (emotion === "frustrated" || emotion === "sad" || emotion === "angry") {
      return {
        action: "empathy_and_support",
        targetTone: "warm_empathetic",
        keyPoints: [
          "Validate user's frustration or feelings naturally (not corporate)",
          "Offer calm, clear assistance",
        ],
      };
    }

    // 3. Ambiguity / Clarification Plan
    if (context.hasMultipleOptions || (primaryIntent === "pricing" && !resolvedPronouns.length && !resolvedQuotedContext && /\b(plan|subscription|course)\b/i.test(understanding.normalizedText) && /\bwhich|konsa|options\b/i.test(understanding.normalizedText))) {
      return {
        action: "clarification",
        targetTone: "concise_helpful",
        keyPoints: [
          "Ask exactly 1 short question to clarify which specific item/plan they want",
        ],
      };
    }

    // 4. Playful / Casual Plan
    if (understanding.socialTone === "playful" || emotion === "happy") {
      return {
        action: "playful_casual",
        targetTone: "friendly_hinglish",
        keyPoints: ["Match user's casual banter or laughter"],
      };
    }

    // 5. Default Direct Answer
    return {
      action: "direct_answer",
      targetTone: "conversational_natural",
      keyPoints: ["Directly answer the question without unnecessary preamble"],
    };
  }
}

export class QualityGate {
  private static ROBOT_PATTERNS = [
    /as an ai(?:\s+language)?(?:\s+model)?/i,
    /i do not have personal (?:feelings|emotions)/i,
    /i apologize for (?:any )?inconvenience caused/i,
    /how may i assist you today/i,
    /feel free to reach out/i,
    /please note that/i,
  ];

  public sanitize(
    text: string,
    history: ConversationHistoryEntry[] = []
  ): ResponseQualityCheck {
    let clean = text.trim();
    const reasons: string[] = [];

    // 1. Strip corporate robotic phrases
    for (const pat of QualityGate.ROBOT_PATTERNS) {
      if (pat.test(clean)) {
        clean = clean.replace(pat, "").trim();
        reasons.push("stripped_robot_phrase");
      }
    }

    // 2. Anti-Repetition Check
    const lastAssistantMessages = history
      .filter((h) => h.role === "assistant")
      .slice(-3)
      .map((h) => h.text.trim().toLowerCase());

    const lowerCandidate = clean.toLowerCase();
    for (const past of lastAssistantMessages) {
      if (past && (past === lowerCandidate || (past.length > 20 && lowerCandidate.includes(past)))) {
        reasons.push("exact_repetition_detected");
        // Rephrase or soften repeated text
        clean = `Haan, jaise pehle bataya tha — ${clean}`;
        break;
      }
    }

    // 3. Length sanity check for WhatsApp
    // If excessively verbose without reason (> 600 chars), truncate gracefully or flag
    if (clean.length > 800) {
      clean = clean.slice(0, 750).trim() + "... (aur jankari ke liye bataiye)";
      reasons.push("trimmed_excessive_length");
    }

    return {
      passed: true,
      sanitizedText: clean,
      reasons,
    };
  }
}

export class ResponseCommitManager {
  // Keyed by tenantId:chatId:turnId
  private committedTurns: Map<string, CommittedResponse> = new Map();
  // Keyed by responseId
  private responsesById: Map<string, CommittedResponse> = new Map();

  private makeKey(tenantId: string, chatId: string, turnId: string): string {
    return `${tenantId}:${chatId}:${turnId}`;
  }

  /**
   * Commits an outbound response for a turn.
   * If a response was ALREADY committed for this turnId, returns the existing response!
   * This guarantees EXACTLY ONE committed response per logical turn.
   */
  public commitResponse(params: {
    turnId: string;
    tenantId: string;
    chatId: string;
    text: string;
    aiGenerated: boolean;
    intent: string;
    plan: ResponsePlan;
  }): { response: CommittedResponse; isDuplicateAttempt: boolean } {
    const key = this.makeKey(params.tenantId, params.chatId, params.turnId);
    const existing = this.committedTurns.get(key);

    if (existing) {
      return {
        response: existing,
        isDuplicateAttempt: true,
      };
    }

    const responseId = `resp_${params.turnId}_${Date.now()}`;
    const committed: CommittedResponse = {
      responseId,
      turnId: params.turnId,
      tenantId: params.tenantId,
      chatId: params.chatId,
      text: params.text,
      aiGenerated: params.aiGenerated,
      intent: params.intent,
      plan: params.plan,
      committedAt: Date.now(),
    };

    this.committedTurns.set(key, committed);
    this.responsesById.set(responseId, committed);

    return {
      response: committed,
      isDuplicateAttempt: false,
    };
  }

  public getByTurn(tenantId: string, chatId: string, turnId: string): CommittedResponse | null {
    return this.committedTurns.get(this.makeKey(tenantId, chatId, turnId)) ?? null;
  }

  public getById(responseId: string): CommittedResponse | null {
    return this.responsesById.get(responseId) ?? null;
  }

  public clear() {
    this.committedTurns.clear();
    this.responsesById.clear();
  }
}

export const responsePlanner = new ResponsePlanner();
export const qualityGate = new QualityGate();
export const responseCommit = new ResponseCommitManager();
