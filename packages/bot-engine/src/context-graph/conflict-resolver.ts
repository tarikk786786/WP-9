/**
 * Memory Conflict Resolver
 * Resolves contradictions deterministically using:
 * explicit > recent > implicit > old
 */

import { type TemporalFact } from './facts.ts';

export class ConflictResolver {
  public resolveAndSupersede(
    existingFacts: TemporalFact[],
    newFact: TemporalFact
  ): { updatedFacts: TemporalFact[]; supersededFactId?: string } {
    const updated = [...existingFacts];

    // Find contradicting facts with same subject and predicate
    const conflictIndex = updated.findIndex(
      (f) =>
        f.status === 'ACTIVE' &&
        f.subject.toLowerCase() === newFact.subject.toLowerCase() &&
        f.predicate.toLowerCase() === newFact.predicate.toLowerCase() &&
        f.object.toLowerCase() !== newFact.object.toLowerCase()
    );

    if (conflictIndex !== -1) {
      const existing = updated[conflictIndex];

      // Evaluation rules:
      // 1. Explicit user statement beats inferred statement
      // 2. If both have same explicitness, newer observedAt beats older
      const newIsExplicit = newFact.source === 'explicit_user';
      const existingIsExplicit = existing.source === 'explicit_user';

      let shouldSupersede = false;
      if (newIsExplicit && !existingIsExplicit) {
        shouldSupersede = true;
      } else if (!newIsExplicit && existingIsExplicit) {
        shouldSupersede = false; // keep existing explicit fact
      } else {
        // Both are same source type: newer wins
        shouldSupersede = newFact.observedAt >= existing.observedAt;
      }

      if (shouldSupersede) {
        existing.status = 'SUPERSEDED';
        existing.validUntil = newFact.validFrom || Date.now();
        newFact.supersedes = existing.factId;
        updated[conflictIndex] = existing;
        updated.push(newFact);
        return { updatedFacts: updated, supersededFactId: existing.factId };
      }
    } else {
      updated.push(newFact);
    }

    return { updatedFacts: updated };
  }
}

export const conflictResolver = new ConflictResolver();
