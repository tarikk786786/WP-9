export class ConversationFatigueEngine {
  private recentShortAcks = new Map<string, number>();

  public evaluateFatigue(chatId: string, incomingText: string): { isFatigued: boolean; suggestedReply?: string } {
    const clean = incomingText.trim().toLowerCase();
    const isPassiveAck = /^(ok|okk|okji|haan|ha|hmm|hmmm|thik|theek|sahi|achha|accha|k)\b/i.test(clean);

    const count = this.recentShortAcks.get(chatId) ?? 0;

    if (isPassiveAck) {
      const newCount = count + 1;
      this.recentShortAcks.set(chatId, newCount);

      if (newCount >= 3) {
        // High fatigue: user wants to wrap up or is busy
        return {
          isFatigued: true,
          suggestedReply: "theek hai!",
        };
      }
    } else {
      // Meaningful message resets fatigue counter
      this.recentShortAcks.set(chatId, 0);
    }

    return { isFatigued: false };
  }

  public reset(chatId: string): void {
    this.recentShortAcks.delete(chatId);
  }
}

export const conversationFatigueEngine = new ConversationFatigueEngine();
export const fatigueEngine = conversationFatigueEngine;
