import type { CanonicalContext } from "./context.ts";
import type { CandidateResponse } from "./model-router.ts";

export interface ResponsePlan {
  turnId: string;
  responseId: string;
  action: "direct_answer" | "empathy_and_support" | "repair_acknowledgment" | "clarification" | "playful_casual";
  intent: string;
  answer: string;
  language: string;
  confidence: number;
  source: string;
  toolsUsed?: string[];
  modelUsed?: string;
  shouldReply: boolean;
}

export class ResponsePlanner {
  public generateResponseId(turnId: string): string {
    return `resp_${turnId}_${Date.now()}`;
  }

  public plan(context: CanonicalContext, candidate: CandidateResponse): ResponsePlan {
    const { turn, understanding } = context;
    const responseId = this.generateResponseId(turn.turnId);

    let action: ResponsePlan["action"] = "direct_answer";
    let finalAnswer = candidate.text;

    if (understanding.isRepair) {
      action = "repair_acknowledgment";
      if (candidate.source === "fallback") {
        finalAnswer = `Acha maaf kijiye, galat samajh gaya tha! ${understanding.repairDetails?.correction || understanding.normalizedText} ke baare mein batata hoon.`;
      }
    } else if (understanding.emotion === "sad" || understanding.emotion === "frustrated") {
      action = "empathy_and_support";
      if (candidate.source === "fallback") {
        finalAnswer = "Arre yaar, pareshaan mat ho! Sab theek ho jayega, batao main kya madad kar sakta hoon?";
      }
    }

    return {
      turnId: turn.turnId,
      responseId,
      action,
      intent: understanding.primaryIntent,
      answer: finalAnswer,
      language: understanding.detectedLanguage,
      confidence: candidate.confidence,
      source: candidate.source,
      toolsUsed: candidate.toolsUsed,
      modelUsed: candidate.modelId,
      shouldReply: true,
    };
  }
}

export const responsePlanner = new ResponsePlanner();
