/**
 * Response Timing Plan
 * Calculates bounded typing duration and pre-send hold
 * based on response complexity and urgency.
 */

export interface ResponseTimingPlan {
  composingDurationMs: number;
  preSendPauseMs: number;
  totalDelayMs: number;
}

export class TimingPlanner {
  public plan(responseText: string, isUrgent = false): ResponseTimingPlan {
    if (isUrgent) {
      return {
        composingDurationMs: 0,
        preSendPauseMs: 0,
        totalDelayMs: 0,
      };
    }

    const len = (responseText || '').length;

    // Short response (< 30 chars): ~500ms composing
    // Medium response (30-150 chars): ~1000ms composing
    // Long response (> 150 chars): max 2000ms composing (bounded ceiling)
    let composingDurationMs = 500;
    if (len > 150) {
      composingDurationMs = 1800;
    } else if (len > 30) {
      composingDurationMs = 1000;
    }

    const preSendPauseMs = 300;

    return {
      composingDurationMs,
      preSendPauseMs,
      totalDelayMs: composingDurationMs + preSendPauseMs,
    };
  }
}

export const timingPlanner = new TimingPlanner();
