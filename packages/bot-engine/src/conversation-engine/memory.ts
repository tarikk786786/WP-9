import type { ActiveConversationState } from "./state.ts";

export type GroundingSource =
  | "CURRENT_TOOL_DATA"
  | "VERIFIED_DATABASE_DATA"
  | "CURRENT_CONVERSATION"
  | "RELEVANT_MEMORY"
  | "GENERAL_KNOWLEDGE"
  | "MODEL_GUESS";

export const GROUNDING_PRIORITY: Record<GroundingSource, number> = {
  CURRENT_TOOL_DATA: 6,
  VERIFIED_DATABASE_DATA: 5,
  CURRENT_CONVERSATION: 4,
  RELEVANT_MEMORY: 3,
  GENERAL_KNOWLEDGE: 2,
  MODEL_GUESS: 1,
};

export interface UserLongTermMemory {
  preferredLanguage?: string;
  preferredResponseLength?: "tiny" | "short" | "medium";
  knownPreferences: Record<string, string>;
  importantFacts: string[];
}

export class MultiTierMemoryManager {
  private activeStates: Map<string, ActiveConversationState> = new Map();
  private longTermMemories: Map<string, UserLongTermMemory> = new Map();

  public getActiveState(chatId: string): ActiveConversationState {
    let state = this.activeStates.get(chatId);
    if (!state) {
      state = {};
      this.activeStates.set(chatId, state);
    }
    return state;
  }

  public updateActiveState(chatId: string, updates: Partial<ActiveConversationState>): ActiveConversationState {
    const current = this.getActiveState(chatId);
    const updated = { ...current, ...updates };
    this.activeStates.set(chatId, updated);
    return updated;
  }

  public getLongTermMemory(chatId: string): UserLongTermMemory {
    let mem = this.longTermMemories.get(chatId);
    if (!mem) {
      mem = {
        knownPreferences: {},
        importantFacts: [],
      };
      this.longTermMemories.set(chatId, mem);
    }
    return mem;
  }

  public saveLongTermPreference(chatId: string, key: string, value: string) {
    const mem = this.getLongTermMemory(chatId);
    mem.knownPreferences[key] = value;
  }

  /**
   * Sorts candidate facts by strict grounding priority
   */
  public prioritizeFacts(
    facts: Array<{ text: string; source: GroundingSource }>
  ): Array<{ text: string; source: GroundingSource }> {
    return facts.sort((a, b) => GROUNDING_PRIORITY[b.source] - GROUNDING_PRIORITY[a.source]);
  }
}

export const memoryManager = new MultiTierMemoryManager();
