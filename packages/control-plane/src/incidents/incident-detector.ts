/**
 * Production Incident Detector
 * Tracks and alerts on operational anomalies such as backpressure,
 * duplicate delivery attempts, delivery failure spikes, and model provider degradation.
 */

export interface IncidentAlert {
  incidentId: string;
  type:
    | 'DUPLICATE_DELIVERY_ATTEMPT'
    | 'DELIVERY_FAILURE_SPIKE'
    | 'QUEUE_BACKPRESSURE'
    | 'CIRCUIT_BREAKER_TRIGGERED'
    | 'UNGROUNDED_RESPONSE_SPIKE';
  severity: 'P1' | 'P2' | 'P3';
  summary: string;
  details: Record<string, unknown>;
  timestamp: number;
}

export class IncidentDetector {
  /**
   * Evaluates delivery metrics to detect failure spikes
   */
  public checkDeliveryFailureRate(params: {
    totalSent: number;
    totalFailed: number;
    windowSeconds: number;
  }): IncidentAlert | null {
    if (params.totalSent === 0) return null;
    const failureRate = params.totalFailed / params.totalSent;
    if (failureRate >= 0.25 && params.totalSent >= 5) {
      return {
        incidentId: `inc-deliv-${Date.now()}`,
        type: 'DELIVERY_FAILURE_SPIKE',
        severity: failureRate >= 0.5 ? 'P1' : 'P2',
        summary: `Delivery failure rate is ${(failureRate * 100).toFixed(1)}% (${params.totalFailed}/${params.totalSent}) in ${params.windowSeconds}s`,
        details: params,
        timestamp: Date.now(),
      };
    }
    return null;
  }

  /**
   * Evaluates queue depth and lag for backpressure
   */
  public checkQueueBackpressure(params: {
    queueDepth: number;
    maxAllowedDepth: number;
    oldestItemAgeMs: number;
    maxAllowedAgeMs: number;
  }): IncidentAlert | null {
    if (
      params.queueDepth > params.maxAllowedDepth ||
      params.oldestItemAgeMs > params.maxAllowedAgeMs
    ) {
      return {
        incidentId: `inc-queue-${Date.now()}`,
        type: 'QUEUE_BACKPRESSURE',
        severity: params.queueDepth > params.maxAllowedDepth * 2 ? 'P1' : 'P2',
        summary: `Outbox/Queue experiencing backpressure (Depth: ${params.queueDepth}, Oldest: ${(params.oldestItemAgeMs / 1000).toFixed(1)}s)`,
        details: params,
        timestamp: Date.now(),
      };
    }
    return null;
  }

  /**
   * Detects duplicate delivery attempts on the same responseId
   */
  public checkDuplicateDeliveryAttempt(
    responseId: string,
    existingDeliveryCount: number
  ): IncidentAlert | null {
    if (existingDeliveryCount > 1) {
      return {
        incidentId: `inc-dup-${responseId}-${Date.now()}`,
        type: 'DUPLICATE_DELIVERY_ATTEMPT',
        severity: 'P1',
        summary: `Multiple delivery attempts detected for response ${responseId} (Count: ${existingDeliveryCount})`,
        details: { responseId, existingDeliveryCount },
        timestamp: Date.now(),
      };
    }
    return null;
  }
}

export const incidentDetector = new IncidentDetector();
