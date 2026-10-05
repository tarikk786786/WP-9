/**
 * Semantic & Voice Endpointing Engine
 *
 * Avoids premature interruptions when caller takes natural brief pauses
 * mid-sentence (e.g. "haan...", "kal jo hua...", "aur...").
 */

export interface EndpointDecision {
  isFinal: boolean;
  recommendedWaitMs: number;
  reason: string;
}

export class CallEndpointingEngine {
  // Trailing linguistic markers in Hindi/Hinglish indicating incomplete thought
  private static readonly INCOMPLETE_MARKERS = [
    /\b(ki|kyunki|lekin|par|aur|ya|matlab|jaise|toh|agar|actually|basically|and|so|but|because)$/i,
    /\b(haan|hmm|acha|achha|theek|suno|sunona|ek baat)$/i,
    /\b(batao na|kaho na)$/i,
  ];

  // Complete thought terminators
  private static readonly COMPLETE_MARKERS = [
    /\b(hai|hain|tha|thi|the|karo|batao|kariye|dekhna|hoga|hogi|chahiye|nahi|kya|kyun|kab|kahan)\.?$/i,
    /\b(kya chal raha hai|sab theek hai|call kar lo|free ho)\??$/i,
  ];

  /**
   * Evaluates whether caller has finished speaking or if we should hold briefly
   */
  public evaluate(partialTranscript: string, silenceDurationMs: number): EndpointDecision {
    const text = partialTranscript.trim().toLowerCase();

    if (!text) {
      return { isFinal: false, recommendedWaitMs: 300, reason: "empty_text" };
    }

    // 1. Check for explicit mid-sentence conjunctions or filler pauses
    for (const marker of CallEndpointingEngine.INCOMPLETE_MARKERS) {
      if (marker.test(text)) {
        // Extend silence window to give caller time to continue
        const needsMoreTime = silenceDurationMs < 850;
        return {
          isFinal: !needsMoreTime,
          recommendedWaitMs: Math.max(0, 850 - silenceDurationMs),
          reason: "trailing_incomplete_conjunction",
        };
      }
    }

    // 2. Trailing question or complete sentence structure
    for (const marker of CallEndpointingEngine.COMPLETE_MARKERS) {
      if (marker.test(text) && silenceDurationMs >= 400) {
        return {
          isFinal: true,
          recommendedWaitMs: 0,
          reason: "complete_grammatical_closure",
        };
      }
    }

    // 3. Default silence threshold: >= 550ms silence declares completion
    if (silenceDurationMs >= 550) {
      return { isFinal: true, recommendedWaitMs: 0, reason: "silence_timeout_met" };
    }

    return {
      isFinal: false,
      recommendedWaitMs: 550 - silenceDurationMs,
      reason: "accumulating_silence",
    };
  }
}
