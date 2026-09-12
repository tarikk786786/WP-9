export type QuestionDecisionType =
  | "ANSWER_DIRECTLY"
  | "ASK_CLARIFICATION"
  | "MAKE_BEST_REASONABLE_INTERPRETATION"
  | "WAIT"
  | "SEARCH"
  | "EXECUTE";

export interface QuestionDecisionResult {
  decision: QuestionDecisionType;
  interpretation?: string;
  clarificationPrompt?: string;
  confidence: number;
}

export class QuestionDecisionEngine {
  public evaluate(
    text: string,
    context?: { activeGoal?: string; lastTopic?: string; isDazy?: boolean },
  ): QuestionDecisionResult {
    const clean = text.trim().toLowerCase();

    // 1. Very short ambiguous messages ("kal?", "kab?", "kahan?")
    if (/^(kal|kab|kahan|kyun|who|where|when)\??$/i.test(clean)) {
      // If we have an active goal (e.g. meeting / project delivery), make best reasonable interpretation
      if (context?.activeGoal === "meeting" || context?.lastTopic === "meeting") {
        return {
          decision: "MAKE_BEST_REASONABLE_INTERPRETATION",
          interpretation: "User is asking about the scheduled meeting time tomorrow.",
          confidence: 85,
        };
      }

      if (context?.activeGoal === "delivery" || context?.lastTopic === "website") {
        return {
          decision: "MAKE_BEST_REASONABLE_INTERPRETATION",
          interpretation: "User is asking about delivery tomorrow.",
          confidence: 80,
        };
      }

      // If completely bare and no context, ask clarification gently
      return {
        decision: "ASK_CLARIFICATION",
        clarificationPrompt: context?.isDazy
          ? "Kal kis baare mein poochh rahi ho meri jaan? 😌❤️"
          : "Kal kis cheez ke baare mein? Thoda bataiye.",
        confidence: 90,
      };
    }

    // 2. Direct factual questions
    return {
      decision: "ANSWER_DIRECTLY",
      confidence: 95,
    };
  }
}

export const questionDecisionEngine = new QuestionDecisionEngine();
