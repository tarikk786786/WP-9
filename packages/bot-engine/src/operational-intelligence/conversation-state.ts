export type ConversationMode =
  | "CASUAL"
  | "SUPPORT"
  | "RESEARCH"
  | "TASK"
  | "TRANSACTION"
  | "EMOTIONAL"
  | "ROMANTIC"
  | "ADMIN"
  | "HUMAN_HANDOFF";

export interface StructuredConversationState {
  chatId: string;
  topic?: string;
  subtopic?: string;
  activeEntity?: string;
  activeGoal?: string;
  pendingAction?: string;
  pendingQuestion?: string;
  lastCorrection?: string;
  emotion: string;
  conversationMode: ConversationMode;
  awaitingUserInput: boolean;
  awaitingTool: boolean;
  lastMeaningfulTurnAt: number;
  fatigueScore: number; // 0 to 10
}

export class ConversationStateManager {
  private states = new Map<string, StructuredConversationState>();

  public getState(chatId: string): StructuredConversationState {
    const existing = this.states.get(chatId);
    if (existing) return existing;

    const initial: StructuredConversationState = {
      chatId,
      emotion: "neutral",
      conversationMode: "CASUAL",
      awaitingUserInput: false,
      awaitingTool: false,
      lastMeaningfulTurnAt: Date.now(),
      fatigueScore: 0,
    };
    this.states.set(chatId, initial);
    return initial;
  }

  public updateState(chatId: string, partial: Partial<StructuredConversationState>): StructuredConversationState {
    const current = this.getState(chatId);
    const updated: StructuredConversationState = {
      ...current,
      ...partial,
      lastMeaningfulTurnAt: Date.now(),
    };
    this.states.set(chatId, updated);
    return updated;
  }
}

export const conversationStateManager = new ConversationStateManager();
