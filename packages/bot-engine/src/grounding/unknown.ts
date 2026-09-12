/**
 * "I Don't Know" Engine (UnknownHandler)
 * Decides when to answer, qualify, clarify, or acknowledge lack of verified information.
 * Categorizes knowledge states into:
 * KNOWN, LIKELY, UNCERTAIN, UNKNOWN, CONFLICTING, STALE
 */

export type KnowledgeCertaintyState =
  | 'KNOWN'       // Verified by tool or internal database
  | 'LIKELY'      // Strong consensus in approved knowledge
  | 'UNCERTAIN'   // Plausible but lacks direct evidence span
  | 'UNKNOWN'     // No evidence available
  | 'CONFLICTING' // Sources contradict each other
  | 'STALE';      // Previously known fact exceeded validity window

export interface UnknownEvaluationResult {
  state: KnowledgeCertaintyState;
  shouldQualify: boolean;
  humbleFallbackText?: string;
  reason: string;
}

export class UnknownHandler {
  public evaluate(
    claimCount: number,
    supportedClaimCount: number,
    hasConflictingEvidence: boolean,
    isStale = false
  ): UnknownEvaluationResult {
    if (isStale) {
      return {
        state: 'STALE',
        shouldQualify: true,
        humbleFallbackText: 'Yeh jankari thodi purani ho sakti hai, main fresh update check kar leta hoon.',
        reason: 'Data freshness expired',
      };
    }

    if (hasConflictingEvidence) {
      return {
        state: 'CONFLICTING',
        shouldQualify: true,
        humbleFallbackText: 'Is baare mein alag alag jankari mil rahi hai, main confirm karke batata hoon.',
        reason: 'Conflicting sources detected',
      };
    }

    if (claimCount === 0) {
      return {
        state: 'KNOWN',
        shouldQualify: false,
        reason: 'No factual claims made (conversational/smalltalk)',
      };
    }

    const supportRatio = supportedClaimCount / claimCount;

    if (supportRatio >= 0.8) {
      return {
        state: 'KNOWN',
        shouldQualify: false,
        reason: 'Claims are well-grounded in verified evidence',
      };
    }

    if (supportRatio >= 0.5) {
      return {
        state: 'UNCERTAIN',
        shouldQualify: true,
        humbleFallbackText: 'Jitna mujhe pata hai, yeh aisi ho sakti hai par confirm karna behtar hoga.',
        reason: 'Partial grounding only',
      };
    }

    return {
      state: 'UNKNOWN',
      shouldQualify: true,
      humbleFallbackText: 'Iski pakki jankari filhal mere paas nahi hai. Main pata karke bataoon?',
      reason: 'No verified grounding found',
    };
  }
}

export const unknownHandler = new UnknownHandler();
