export interface TurnSpan {
  name:
    | "intake"
    | "understanding"
    | "memory_retrieval"
    | "decision"
    | "tool_execution"
    | "model_generation"
    | "quality_gate"
    | "commit"
    | "outbox_send";
  startTimeMs: number;
  endTimeMs: number;
  durationMs: number;
  status: "OK" | "ERROR";
  attributes?: Record<string, unknown>;
  error?: string;
}

export interface ToolCallTrace {
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
  durationMs: number;
  success: boolean;
}

export interface TurnTrace {
  traceId: string;
  turnId: string;
  chatId: string;
  sender: string;
  isDazy: boolean;
  userText: string;
  timestamp: number;
  intent?: string;
  emotion?: string;
  memoryRetrieved?: string[];
  toolCalls: ToolCallTrace[];
  modelUsed?: string;
  generationSource?: string;
  candidateAnswer?: string;
  qualityAudit?: {
    passed: boolean;
    humilityScore: number;
    naturalnessScore: number;
    repairsMade: string[];
    reasons: string[];
  };
  finalAnswer?: string;
  responseId?: string;
  sendResult?: {
    status: "SENT" | "FAILED";
    messageId?: string;
    error?: string;
  };
  totalDurationMs?: number;
  spans: TurnSpan[];
}

export class ConversationBrainTelemetry {
  private recentTraces: Map<string, TurnTrace> = new Map();
  private maxStoredTraces = 200;

  public startTrace(params: {
    turnId: string;
    chatId: string;
    sender: string;
    userText: string;
    isDazy: boolean;
  }): TurnTrace {
    const traceId = `tr_${params.turnId}_${Date.now()}`;
    const trace: TurnTrace = {
      traceId,
      turnId: params.turnId,
      chatId: params.chatId,
      sender: params.sender,
      isDazy: params.isDazy,
      userText: params.userText,
      timestamp: Date.now(),
      toolCalls: [],
      spans: [],
    };

    this.saveTrace(trace);
    return trace;
  }

  public recordSpan(
    turnId: string,
    name: TurnSpan["name"],
    startTimeMs: number,
    status: "OK" | "ERROR",
    attributes?: Record<string, unknown>,
    error?: string
  ) {
    const trace = this.recentTraces.get(turnId);
    if (!trace) return;

    const endTimeMs = Date.now();
    trace.spans.push({
      name,
      startTimeMs,
      endTimeMs,
      durationMs: endTimeMs - startTimeMs,
      status,
      attributes,
      error,
    });
  }

  public recordUnderstanding(turnId: string, intent: string, emotion: string) {
    const trace = this.recentTraces.get(turnId);
    if (!trace) return;
    trace.intent = intent;
    trace.emotion = emotion;
  }

  public recordMemory(turnId: string, memories: string[]) {
    const trace = this.recentTraces.get(turnId);
    if (!trace) return;
    trace.memoryRetrieved = memories;
  }

  public recordToolCall(turnId: string, call: ToolCallTrace) {
    const trace = this.recentTraces.get(turnId);
    if (!trace) return;
    trace.toolCalls.push(call);
  }

  public recordGeneration(
    turnId: string,
    candidate: { source: string; text: string; modelId?: string }
  ) {
    const trace = this.recentTraces.get(turnId);
    if (!trace) return;
    trace.generationSource = candidate.source;
    trace.candidateAnswer = candidate.text;
    trace.modelUsed = candidate.modelId || candidate.source;
  }

  public recordQualityAudit(
    turnId: string,
    audit: {
      passed: boolean;
      scores?: { humility: number; naturalness: number };
      repairsMade?: string[];
      reasons?: string[];
    }
  ) {
    const trace = this.recentTraces.get(turnId);
    if (!trace) return;
    trace.qualityAudit = {
      passed: audit.passed,
      humilityScore: audit.scores?.humility ?? 100,
      naturalnessScore: audit.scores?.naturalness ?? 100,
      repairsMade: audit.repairsMade ?? [],
      reasons: audit.reasons ?? [],
    };
  }

  public recordCommit(turnId: string, responseId: string, finalAnswer: string) {
    const trace = this.recentTraces.get(turnId);
    if (!trace) return;
    trace.responseId = responseId;
    trace.finalAnswer = finalAnswer;
    trace.totalDurationMs = Date.now() - trace.timestamp;

    // Pluggable Langfuse/OpenTelemetry background dispatch
    this.exportToExternalObservability(trace);
  }

  public recordSendResult(
    turnId: string,
    result: { status: "SENT" | "FAILED"; messageId?: string; error?: string }
  ) {
    const trace = this.recentTraces.get(turnId);
    if (!trace) return;
    trace.sendResult = result;
  }

  public getTrace(turnId: string): TurnTrace | undefined {
    return this.recentTraces.get(turnId);
  }

  public getRecentTraces(limit = 20, chatId?: string): TurnTrace[] {
    const all = Array.from(this.recentTraces.values());
    const filtered = chatId ? all.filter((t) => t.chatId === chatId) : all;
    return filtered.slice(-limit).reverse();
  }

  private saveTrace(trace: TurnTrace) {
    if (this.recentTraces.size >= this.maxStoredTraces) {
      const oldestKey = this.recentTraces.keys().next().value;
      if (oldestKey) this.recentTraces.delete(oldestKey);
    }
    this.recentTraces.set(trace.turnId, trace);
  }

  /**
   * Dispatches to Langfuse or OpenTelemetry if configured in environment variables
   */
  private exportToExternalObservability(trace: TurnTrace) {
    const langfuseHost = process.env.LANGFUSE_HOST || "https://cloud.langfuse.com";
    const langfuseKey = process.env.LANGFUSE_PUBLIC_KEY;
    const langfuseSecret = process.env.LANGFUSE_SECRET_KEY;

    if (langfuseKey && langfuseSecret) {
      // Non-blocking async forward to Langfuse ingestion API
      void (async () => {
        try {
          const auth = Buffer.from(`${langfuseKey}:${langfuseSecret}`).toString("base64");
          await fetch(`${langfuseHost}/api/public/ingestion`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Basic ${auth}`,
            },
            body: JSON.stringify({
              batch: [
                {
                  id: trace.traceId,
                  type: "trace-create",
                  timestamp: new Date(trace.timestamp).toISOString(),
                  body: {
                    id: trace.traceId,
                    name: `whatsapp_turn_${trace.isDazy ? "dazy" : "user"}`,
                    userId: trace.sender,
                    metadata: {
                      chatId: trace.chatId,
                      intent: trace.intent,
                      emotion: trace.emotion,
                      modelUsed: trace.modelUsed,
                      humilityScore: trace.qualityAudit?.humilityScore,
                      naturalnessScore: trace.qualityAudit?.naturalnessScore,
                    },
                    input: trace.userText,
                    output: trace.finalAnswer,
                  },
                },
              ],
            }),
          }).catch(() => {});
        } catch {
          // Observability should never impact core conversation execution
        }
      })();
    }
  }
}

export const brainTelemetry = new ConversationBrainTelemetry();
