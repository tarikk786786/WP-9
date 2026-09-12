/**
 * Temporal Truth Engine
 * Determines what is currently true vs historical facts.
 */

import { type TemporalFact } from './facts.ts';

export class TemporalEngine {
  /**
   * Retrieves all facts that are active and currently valid at queryTime (defaults to now)
   */
  public getActiveFacts(facts: TemporalFact[], queryTime = Date.now()): TemporalFact[] {
    return facts.filter((f) => {
      if (f.status !== 'ACTIVE') return false;
      if (f.validFrom > queryTime) return false;
      if (f.validUntil && f.validUntil < queryTime) return false;
      return true;
    });
  }

  /**
   * Finds the fact history for a given subject and predicate
   */
  public getFactTimeline(facts: TemporalFact[], subject: string, predicate: string): TemporalFact[] {
    return facts
      .filter(
        (f) =>
          f.subject.toLowerCase() === subject.toLowerCase() &&
          f.predicate.toLowerCase() === predicate.toLowerCase()
      )
      .sort((a, b) => b.observedAt - a.observedAt);
  }
}

export const temporalEngine = new TemporalEngine();
