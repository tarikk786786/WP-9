/**
 * Offline Replay Engine
 * Allows deterministic re-execution and debugging of historical conversation turns
 * using recorded inputs, facts, and model snapshots.
 */

export interface RecordedTurnContext {
  turnId: string;
  senderId: string;
  messageText: string;
  recordedFacts: Array<{ key: string; value: string }>;
  originalResponse?: string;
  timestamp: number;
}

export interface ReplayResult {
  turnId: string;
  simulatedOutput: string;
  matchesOriginal: boolean;
  divergenceNotes?: string[];
  durationMs: number;
}

export class ReplayEngine {
  /**
   * Replays a single turn deterministically against a decision function
   */
  public async replayTurn(
    context: RecordedTurnContext,
    decisionFn: (input: { text: string; facts: Record<string, string> }) => Promise<string>
  ): Promise<ReplayResult> {
    const start = Date.now();
    const factsObj: Record<string, string> = {};
    for (const f of context.recordedFacts) {
      factsObj[f.key] = f.value;
    }

    const simulatedOutput = await decisionFn({
      text: context.messageText,
      facts: factsObj,
    });

    const durationMs = Date.now() - start;
    const matchesOriginal = context.originalResponse
      ? simulatedOutput.trim() === context.originalResponse.trim()
      : true;

    const divergenceNotes: string[] = [];
    if (!matchesOriginal && context.originalResponse) {
      divergenceNotes.push(
        `Original was: "${context.originalResponse}" but simulated: "${simulatedOutput}"`
      );
    }

    return {
      turnId: context.turnId,
      simulatedOutput,
      matchesOriginal,
      divergenceNotes: divergenceNotes.length > 0 ? divergenceNotes : undefined,
      durationMs,
    };
  }
}

export const replayEngine = new ReplayEngine();
