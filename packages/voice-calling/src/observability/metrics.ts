import { CallLatencyMetrics, CallMetrics, CallState, VoiceTurn, CallEndReason } from "../types.js";

export class CallMetricsCollector {
  private readonly callId: string;
  private readonly callerPhone: string;
  private readonly startedAt: number;
  private answeredAt?: number;
  private endedAt?: number;
  private status: CallState = "IDLE";
  private endReason?: CallEndReason;
  private failureReason?: string;
  private bargeInCount: number = 0;
  private turns: VoiceTurn[] = [];
  private latencies: CallLatencyMetrics[] = [];
  private packetLossCount: number = 0;
  private jitterDiscardCount: number = 0;
  private clippingIncidents: number = 0;

  constructor(callId: string, callerPhone: string, startedAt: number = Date.now()) {
    this.callId = callId;
    this.callerPhone = callerPhone;
    this.startedAt = startedAt;
  }

  public markAnswered(now: number = Date.now()): void {
    this.answeredAt = now;
    this.status = "CONNECTED";
  }

  public recordTurn(turn: VoiceTurn): void {
    this.turns.push(turn);
  }

  public recordLatency(latency: CallLatencyMetrics): void {
    this.latencies.push(latency);
  }

  public recordBargeIn(): void {
    this.bargeInCount++;
  }

  public recordPacketLoss(count: number = 1): void {
    this.packetLossCount += count;
  }

  public recordJitterDiscard(count: number = 1): void {
    this.jitterDiscardCount += count;
  }

  public recordClipping(count: number = 1): void {
    this.clippingIncidents += count;
  }

  public markEnded(reason: CallEndReason, status: CallState = "ENDED", failureReason?: string, now: number = Date.now()): void {
    this.endedAt = now;
    this.endReason = reason;
    this.status = status;
    this.failureReason = failureReason;
  }

  public getSnapshot(): CallMetrics {
    const now = Date.now();
    const durationMs = this.endedAt ? this.endedAt - this.startedAt : now - this.startedAt;
    
    // Simple cost estimation (approx $0.005 per turn ASR + LLM + TTS)
    const costEstimatedUsd = this.turns.length * 0.005;

    return {
      callId: this.callId,
      callerPhone: this.callerPhone,
      startedAt: this.startedAt,
      answeredAt: this.answeredAt,
      endedAt: this.endedAt,
      durationMs,
      turns: [...this.turns],
      bargeInCount: this.bargeInCount,
      latencies: [...this.latencies],
      status: this.status,
      endReason: this.endReason,
      failureReason: this.failureReason,
      costEstimatedUsd,
    };
  }

  public getAverageTurnLatencyMs(): number {
    if (this.latencies.length === 0) return 0;
    const sum = this.latencies.reduce((acc, l) => acc + l.totalTurnMs, 0);
    return Math.round(sum / this.latencies.length);
  }
}
