import { CallLogRecord, CallMetrics, CallState, CallEndReason } from "../types.js";

export class CallAuditLogger {
  private readonly logs: CallLogRecord[] = [];
  private readonly maxRecords: number;

  constructor(maxRecords: number = 500) {
    this.maxRecords = maxRecords;
  }

  public recordCall(metrics: CallMetrics): CallLogRecord {
    const startedIso = new Date(metrics.startedAt).toISOString();
    const answeredIso = metrics.answeredAt ? new Date(metrics.answeredAt).toISOString() : undefined;
    const endedIso = metrics.endedAt ? new Date(metrics.endedAt).toISOString() : new Date().toISOString();
    const durationSeconds = Math.round(metrics.durationMs / 1000);

    const languages = metrics.turns.map((t) => t.language).filter((l) => l !== "unknown");
    const dominantLang = languages.length > 0 ? languages[0] : "unknown";

    const avgLatency =
      metrics.latencies.length > 0
        ? Math.round(metrics.latencies.reduce((acc, l) => acc + l.totalTurnMs, 0) / metrics.latencies.length)
        : 0;

    const record: CallLogRecord = {
      callId: metrics.callId,
      conversationId: `call_${metrics.callId}`,
      caller: metrics.callerPhone,
      startedAt: startedIso,
      answeredAt: answeredIso,
      endedAt: endedIso,
      durationSeconds,
      status: metrics.status,
      endReason: metrics.endReason || ("NORMAL" as CallEndReason),
      language: dominantLang,
      turnCount: metrics.turns.length,
      toolCount: 0,
      bargeInCount: metrics.bargeInCount,
      failureReason: metrics.failureReason,
      averageLatencyMs: avgLatency,
    };

    this.logs.unshift(record);
    if (this.logs.length > this.maxRecords) {
      this.logs.pop();
    }

    return record;
  }

  public getRecentLogs(limit: number = 50): CallLogRecord[] {
    return this.logs.slice(0, limit);
  }

  public getCallById(callId: string): CallLogRecord | undefined {
    return this.logs.find((l) => l.callId === callId);
  }

  public clear(): void {
    this.logs.length = 0;
  }
}
