export type EmotionType =
  | "neutral"
  | "happy"
  | "excited"
  | "curious"
  | "confused"
  | "frustrated"
  | "angry"
  | "sad"
  | "disappointed"
  | "anxious"
  | "worried"
  | "relieved"
  | "grateful"
  | "playful"
  | "sarcastic"
  | "urgent"
  | "tired"
  | "hesitant";

export interface EmotionState {
  primary: EmotionType;
  secondary?: EmotionType;
  intensity: "low" | "medium" | "high";
  confidence: number;
  evidence: string[];
  trend?: "escalating" | "stable" | "de-escalating";
}

export type SpeechAct =
  | "QUESTION"
  | "ANSWER"
  | "FOLLOW_UP"
  | "CORRECTION"
  | "AGREEMENT"
  | "DISAGREEMENT"
  | "CLARIFICATION"
  | "EMOTIONAL_EXPRESSION"
  | "SMALL_TALK"
  | "JOKE"
  | "REQUEST"
  | "COMMAND"
  | "CONFIRMATION"
  | "NEGATION"
  | "ACKNOWLEDGEMENT";

export type UserGoal =
  | "asking_price"
  | "booking"
  | "getting_information"
  | "complaining"
  | "seeking_reassurance"
  | "making_decision"
  | "continuing_previous"
  | "casual_conversation"
  | "requesting_action"
  | "repair_misunderstanding"
  | "romantic_connection"
  | "unknown";

export type ResponseStyle =
  | "DIRECT"
  | "CASUAL"
  | "WARM"
  | "EMPATHETIC"
  | "PROFESSIONAL"
  | "PLAYFUL"
  | "URGENT"
  | "REASSURING"
  | "EXPLANATORY"
  | "TECHNICAL"
  | "ROMANTIC";

export interface PersonalityProfile {
  name: string;
  warmth: number;
  humor: number;
  brevity: number;
  formality: number;
  directness: number;
  empathy: number;
  emojiUsage: number;
  initiative: number;
}

export interface ActiveConversationState {
  topic?: string;
  entity?: string;
  pendingQuestion?: string;
  lastCorrection?: string;
  userStyle?: string;
  emotionTrend?: string;
  romanticLevel?: number;
  lastResponseId?: string;
  lastIntent?: string;
  lastSpokenAt?: number;
}

export interface AnswerPlan {
  directAnswer: boolean;
  contextNeeded: boolean;
  emotionalApproach: string;
  language: string;
  tone: ResponseStyle;
  length: "tiny" | "short" | "medium" | "structured";
  facts: string[];
  toolsUsed: string[];
  followUpNeeded: boolean;
  followUpQuestion?: string;
  isDazyProfile?: boolean;
  romanticLevel?: number;
}
