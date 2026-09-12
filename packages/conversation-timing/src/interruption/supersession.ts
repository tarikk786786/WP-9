/**
 * Response Supersession & Interruption Manager
 * If a newer message arrives while an old response is still generating or pending delivery,
 * checks if the user cancelled ("nahi rehne do") or changed topic, and supersedes the stale draft.
 */

export interface PendingResponseDraft {
  responseId: string;
  turnId: string;
  chatId: string;
  conversationVersion: number;
  createdAt: number;
  abortController?: AbortController;
}

export class SupersessionManager {
  private activePendingDrafts = new Map<string, PendingResponseDraft>();

  public registerPending(draft: PendingResponseDraft): void {
    this.activePendingDrafts.set(draft.chatId, draft);
  }

  public checkInterruption(
    chatId: string,
    newMessageText: string,
    newConversationVersion: number
  ): { isInterrupted: boolean; cancelledResponseId?: string; reason?: string } {
    const pending = this.activePendingDrafts.get(chatId);
    if (!pending) {
      return { isInterrupted: false };
    }

    const clean = (newMessageText || '').toLowerCase().trim();
    const isExplicitCancel = /^(?:nahi|nah|rehne\s+do|cancel|stop|wait|ruk|ruko)\b/i.test(clean);

    // If explicit cancel or conversation version advanced
    if (isExplicitCancel || newConversationVersion > pending.conversationVersion) {
      if (pending.abortController) {
        pending.abortController.abort();
      }
      this.activePendingDrafts.delete(chatId);
      return {
        isInterrupted: true,
        cancelledResponseId: pending.responseId,
        reason: isExplicitCancel ? 'User explicitly cancelled previous request' : 'Conversation version advanced',
      };
    }

    return { isInterrupted: false };
  }

  public clear(chatId: string): void {
    this.activePendingDrafts.delete(chatId);
  }
}

export const supersessionManager = new SupersessionManager();
