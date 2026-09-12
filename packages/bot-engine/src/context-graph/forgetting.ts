/**
 * Forgetting Engine & Memory Lifecycle
 * Supports explicit user deletion commands ("forget this", "delete my history").
 * Ensures deactivated data is removed from retrieval.
 */

import { type TemporalFact } from './facts.ts';

export class ForgettingEngine {
  public deleteFact(facts: TemporalFact[], factId: string): TemporalFact[] {
    return facts.map((f) => {
      if (f.factId === factId) {
        return { ...f, status: 'DELETED', validUntil: Date.now() };
      }
      return f;
    });
  }

  public deleteChatMemory(facts: TemporalFact[], chatId: string): TemporalFact[] {
    return facts.map((f) => {
      if (f.chatId === chatId) {
        return { ...f, status: 'DELETED', validUntil: Date.now() };
      }
      return f;
    });
  }

  public isForgettingIntent(text: string): { isForgetting: boolean; target?: string } {
    const clean = (text || '').toLowerCase().trim();
    if (
      clean.includes('forget this') ||
      clean.includes('bhool jao') ||
      clean.includes('delete my memory') ||
      clean.includes('delete my history') ||
      clean.includes('remove my data')
    ) {
      return { isForgetting: true, target: 'all' };
    }
    return { isForgetting: false };
  }
}

export const forgettingEngine = new ForgettingEngine();
