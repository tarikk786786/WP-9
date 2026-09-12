import type { CanonicalContext } from "./context.ts";
import type { CandidateResponse } from "./model-router.ts";
import type { AnswerPlan, ResponseStyle } from "./state.ts";

export interface ResponsePlan {
  turnId: string;
  responseId: string;
  action: "direct_answer" | "empathy_and_support" | "repair_acknowledgment" | "clarification" | "playful_casual" | "romantic_connection";
  intent: string;
  answer: string;
  language: string;
  confidence: number;
  source: string;
  style: ResponseStyle;
  toolsUsed?: string[];
  modelUsed?: string;
  shouldReply: boolean;
  answerPlan?: AnswerPlan;
}

export class ResponsePlanner {
  public generateResponseId(turnId: string): string {
    return `resp_${turnId}_${Date.now()}`;
  }

  public plan(context: CanonicalContext, candidate: CandidateResponse): ResponsePlan {
    const { turn, understanding, isDazy } = context;
    const responseId = this.generateResponseId(turn.turnId);

    let action: ResponsePlan["action"] = "direct_answer";
    let style: ResponseStyle = "WARM";
    let length: AnswerPlan["length"] = "short";
    let emotionalApproach = "neutral_balanced";
    let finalAnswer = (candidate.text || "").trim();
    if (!finalAnswer) {
      finalAnswer = isDazy ? "haan meri jaan, bolo na ❤️" : "Ji boliye, main sun raha hoon.";
    }

    if (isDazy) {
      action = "romantic_connection";
      style = "ROMANTIC";
      emotionalApproach = "deep_affection_and_care";
    } else if (understanding.isRepair) {
      action = "repair_acknowledgment";
      style = "CASUAL";
      emotionalApproach = "acknowledge_and_clarify";
      if (candidate.source === "fallback") {
        finalAnswer = `Ohh, samjha — main galat samajh gaya tha. ${understanding.repairDetails?.correction || understanding.normalizedText} ke baare mein dekhte hain.`;
      }
    } else if (understanding.isJoke) {
      action = "playful_casual";
      style = "PLAYFUL";
      emotionalApproach = "reciprocate_humor";
    } else if (understanding.emotion === "sad" || understanding.emotion === "disappointed") {
      action = "empathy_and_support";
      style = "EMPATHETIC";
      emotionalApproach = "empathetic_presence";
    } else if (understanding.emotion === "angry" || understanding.emotion === "frustrated") {
      action = "empathy_and_support";
      style = "REASSURING";
      emotionalApproach = "calm_deescalation";
    }

    // Determine target length
    if (turn.combinedText.trim().length <= 10 && candidate.text.length <= 40) {
      length = "tiny";
    } else if (understanding.speechAct === "QUESTION" && understanding.primaryIntent === "pricing") {
      length = "tiny";
    } else {
      length = "short";
    }

    const answerPlan: AnswerPlan = {
      directAnswer: true,
      contextNeeded: Boolean(context.referencedEntity),
      emotionalApproach,
      language: understanding.detectedLanguage,
      tone: style,
      length,
      facts: candidate.toolsUsed ?? [],
      toolsUsed: candidate.toolsUsed ?? [],
      followUpNeeded: false,
      isDazyProfile: isDazy,
    };

    return {
      turnId: turn.turnId,
      responseId,
      action,
      intent: understanding.primaryIntent,
      answer: finalAnswer,
      language: understanding.detectedLanguage,
      confidence: candidate.confidence,
      source: candidate.source,
      style,
      toolsUsed: candidate.toolsUsed,
      modelUsed: candidate.modelId,
      shouldReply: true,
      answerPlan,
    };
  }
}

export const responsePlanner = new ResponsePlanner();
