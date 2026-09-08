export type ConversationalAction =
  | "answer"
  | "ask"
  | "clarify"
  | "acknowledge"
  | "decline"
  | "escalate"
  | "wait";

export type UserStyle = {
  language: "hinglish" | "english" | "hindi" | "bengali" | "urdu";
  formality: "low" | "medium";
  avgLength: number;
  usesEmoji: boolean;
  usesSlang: boolean;
};

export type ResponsePlan = {
  action: ConversationalAction;
  intent: string;
  goal: string;
  tone: "casual" | "calm" | "direct";
  language: UserStyle["language"];
  answerLength: "short" | "complete";
  needsQuestion: boolean;
  needsClarification: boolean;
  confidence: number;
  complexity: number;
  requiresKnowledge: boolean;
  requiresReasoning: boolean;
  requiresVision: boolean;
  requiresAudio: boolean;
  urgency: number;
  draft?: string;
  summary: string;
  meaning?: string;
};
