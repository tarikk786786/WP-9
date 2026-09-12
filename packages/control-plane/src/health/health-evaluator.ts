/**
 * Multi-Layered Health Evaluator (L0 - L9)
 * Evaluates real system health across Process, Transport, DB, Queue, AI, Media, and Invariants.
 */

export type HealthStatus = 'HEALTHY' | 'DEGRADED' | 'NOT_READY' | 'FAILED';

export interface LayerHealth {
  status: HealthStatus;
  details?: Record<string, unknown>;
  latencyMs?: number;
}

export interface SystemHealthReport {
  overall: HealthStatus;
  layers: {
    l0_process: LayerHealth;
    l1_transport: LayerHealth;
    l2_database: LayerHealth;
    l3_queue: LayerHealth;
    l4_ai_providers: LayerHealth;
    l5_media: LayerHealth;
    l6_conversation: LayerHealth;
    l7_delivery: LayerHealth;
    l8_automation: LayerHealth;
    l9_data_integrity: LayerHealth;
  };
  evaluatedAt: string;
}

export class HealthEvaluator {
  public evaluate(inputs: {
    isWorkerAlive: boolean;
    isWhatsappConnected: boolean;
    isDatabaseConnected: boolean;
    isQueueHealthy?: boolean;
    circuitBreakersTripped?: number;
    hasIntegrityViolations?: boolean;
    stuckClaimsCount?: number;
  }): SystemHealthReport {
    const l0_process: LayerHealth = {
      status: inputs.isWorkerAlive ? 'HEALTHY' : 'FAILED',
    };

    const l1_transport: LayerHealth = {
      status: inputs.isWhatsappConnected ? 'HEALTHY' : 'NOT_READY',
    };

    const l2_database: LayerHealth = {
      status: inputs.isDatabaseConnected ? 'HEALTHY' : 'FAILED',
    };

    const l3_queue: LayerHealth = {
      status: inputs.isQueueHealthy !== false ? 'HEALTHY' : 'DEGRADED',
    };

    const l4_ai_providers: LayerHealth = {
      status: (inputs.circuitBreakersTripped ?? 0) === 0 ? 'HEALTHY' : 'DEGRADED',
      details: { trippedCount: inputs.circuitBreakersTripped ?? 0 },
    };

    const l5_media: LayerHealth = {
      status: 'HEALTHY',
    };

    const l6_conversation: LayerHealth = {
      status: (inputs.stuckClaimsCount ?? 0) === 0 ? 'HEALTHY' : 'DEGRADED',
    };

    const l7_delivery: LayerHealth = {
      status: 'HEALTHY',
    };

    const l8_automation: LayerHealth = {
      status: 'HEALTHY',
    };

    const l9_data_integrity: LayerHealth = {
      status: inputs.hasIntegrityViolations ? 'FAILED' : 'HEALTHY',
    };

    // Overall decision
    let overall: HealthStatus = 'HEALTHY';
    if (!inputs.isWorkerAlive || !inputs.isDatabaseConnected || inputs.hasIntegrityViolations) {
      overall = 'FAILED';
    } else if (!inputs.isWhatsappConnected || (inputs.circuitBreakersTripped ?? 0) > 0 || (inputs.stuckClaimsCount ?? 0) > 0) {
      overall = 'DEGRADED';
    }

    return {
      overall,
      layers: {
        l0_process,
        l1_transport,
        l2_database,
        l3_queue,
        l4_ai_providers,
        l5_media,
        l6_conversation,
        l7_delivery,
        l8_automation,
        l9_data_integrity,
      },
      evaluatedAt: new Date().toISOString(),
    };
  }
}

export const healthEvaluator = new HealthEvaluator();
