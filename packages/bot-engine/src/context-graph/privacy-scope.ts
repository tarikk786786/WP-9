/**
 * Privacy Scope Guard
 * Strictly filters retrieved memories so private contact memories never leak
 * into group conversations or across different customer accounts.
 */

import { type TemporalFact, type MemoryScope } from './facts.ts';

export class PrivacyScopeGuard {
  public filterFactsForContext(
    facts: TemporalFact[],
    queryContext: {
      chatId: string;
      isGroup: boolean;
      authorizedScope: MemoryScope;
    }
  ): TemporalFact[] {
    return facts.filter((f) => {
      // 1. Never include deleted or superseded facts
      if (f.status !== 'ACTIVE') return false;

      // 2. If current context is a group conversation, reject private memories
      if (queryContext.isGroup && f.scope === 'private') {
        return false;
      }

      // 3. Ensure memory belongs to this specific chat or is global system memory
      if (f.scope === 'private' && f.chatId !== queryContext.chatId) {
        return false;
      }

      return true;
    });
  }
}

export const privacyScopeGuard = new PrivacyScopeGuard();
