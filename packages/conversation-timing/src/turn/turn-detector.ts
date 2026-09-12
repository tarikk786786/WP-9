/**
 * Turn Detector & Burst Aggregator
 * Decides whether to reply immediately or wait for the user to finish a thought.
 */

export type TurnAction =
  | 'RESPOND_NOW'
  | 'WAIT_FOR_MORE'
  | 'MERGE_WITH_BURST'
  | 'CANCEL_PENDING'
  | 'NO_REPLY';

export interface TurnDecision {
  action: TurnAction;
  confidence: number;
  reason: string;
  isUrgent: boolean;
}

export class TurnDetector {
  public evaluate(
    currentText: string,
    historyRecentCount = 0,
    timeSinceLastMessageMs = 0
  ): TurnDecision {
    const text = (currentText || '').trim();

    // 1. High-urgency bypass
    const isUrgent = /(?:urgent|emergency|accident|help\s+me|madad|jaldi)\b/i.test(text);
    if (isUrgent) {
      return {
        action: 'RESPOND_NOW',
        confidence: 0.98,
        reason: 'Urgent keywords detected; bypassing burst hold',
        isUrgent: true,
      };
    }

    // 2. Trailing punctuation or incomplete thought markers
    const endsWithEllipsis = /\.\.\.$|…$|,\s*$/.test(text);
    const isIncompleteOpener = /^(?:sun|suno|ek\s+baat|actually|waise|listen|hey)\b/i.test(text) && text.length < 15;

    if ((endsWithEllipsis || isIncompleteOpener) && timeSinceLastMessageMs < 2500) {
      return {
        action: 'WAIT_FOR_MORE',
        confidence: 0.88,
        reason: 'Sentence appears incomplete or introductory fragment',
        isUrgent: false,
      };
    }

    // 3. Very short message in active rapid burst
    if (text.length < 8 && timeSinceLastMessageMs < 1500) {
      return {
        action: 'MERGE_WITH_BURST',
        confidence: 0.85,
        reason: 'Rapid burst fragment; wait for subsequent messages',
        isUrgent: false,
      };
    }

    // 4. Complete thought
    return {
      action: 'RESPOND_NOW',
      confidence: 0.92,
      reason: 'Thought appears complete',
      isUrgent: false,
    };
  }
}

export const turnDetector = new TurnDetector();
