import { CallLatencyMetrics } from "../types.js";

export interface Span {
  name: string;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
}

export class TurnTracer {
  private readonly callId: string;
  private readonly turnId: string;
  private readonly startedAt: number;
  private readonly spans: Map<string, Span> = new Map();

  constructor(callId: string, turnId: string) {
    this.callId = callId;
    this.turnId = turnId;
    this.startedAt = Date.now();
  }

  public startSpan(name: string, now: number = Date.now()): void {
    this.spans.set(name, {
      name,
      startedAt: now,
    });
  }

  public endSpan(name: string, now: number = Date.now()): number {
    const span = this.spans.get(name);
    if (!span) return 0;
    span.endedAt = now;
    span.durationMs = now - span.startedAt;
    return span.durationMs;
  }

  public getSpanDuration(name: string): number {
    const span = this.spans.get(name);
    if (!span || span.durationMs === undefined) return 0;
    return span.durationMs;
  }

  public toLatencyMetrics(): CallLatencyMetrics {
    const now = Date.now();
    return {
      vadMs: this.getSpanDuration("vad"),
      asrMs: this.getSpanDuration("asr"),
      llmMs: this.getSpanDuration("llm"),
      ttsFirstByteMs: this.getSpanDuration("tts_first_byte"),
      totalTurnMs: now - this.startedAt,
    };
  }
}
