/**
 * State Reconciler
 * Periodically compares messages, turns, responses, and outbox items to find
 * impossible state combinations and repair or flag them deterministically.
 */

export interface ReconciliationAnomaly {
  anomalyType:
    | 'ORPHAN_RESPONSE'
    | 'MISSING_OUTBOX_ITEM'
    | 'STALE_LEASE'
    | 'STUCK_CLAIM'
    | 'DELIVERY_INCONSISTENCY';
  severity: 'WARNING' | 'ERROR' | 'CRITICAL';
  entityId: string;
  description: string;
}

export interface ReconcileParams {
  claims: Array<{ messageId: string; status: string; leaseUntil?: number }>;
  turns: Array<{ turnId: string; status: string }>;
  responses: Array<{ responseId: string; turnId: string; status: string }>;
  outbox: Array<{ responseId: string; status: string }>;
}

export class StateReconciler {
  public reconcile(params: ReconcileParams): {
    anomalies: ReconciliationAnomaly[];
    repairedCount: number;
  } {
    const anomalies: ReconciliationAnomaly[] = [];
    const now = Date.now();
    let repairedCount = 0;

    const turnMap = new Set(params.turns.map((t) => t.turnId));
    const outboxMap = new Map(params.outbox.map((o) => [o.responseId, o.status]));

    // 1. Detect orphan responses (response exists but turn doesn't)
    for (const resp of params.responses) {
      if (!turnMap.has(resp.turnId)) {
        anomalies.push({
          anomalyType: 'ORPHAN_RESPONSE',
          severity: 'ERROR',
          entityId: resp.responseId,
          description: `Response ${resp.responseId} references non-existent turn ${resp.turnId}`,
        });
      }

      // 2. Detect missing outbox item for committed responses
      if (resp.status === 'COMMITTED' && !outboxMap.has(resp.responseId)) {
        anomalies.push({
          anomalyType: 'MISSING_OUTBOX_ITEM',
          severity: 'CRITICAL',
          entityId: resp.responseId,
          description: `Committed response ${resp.responseId} is missing an outbox queue record`,
        });
      }
    }

    // 3. Detect stuck claims where lease expired without response
    for (const claim of params.claims) {
      if (
        claim.status === 'CLAIMED' &&
        claim.leaseUntil &&
        claim.leaseUntil < now
      ) {
        anomalies.push({
          anomalyType: 'STUCK_CLAIM',
          severity: 'WARNING',
          entityId: claim.messageId,
          description: `Message claim ${claim.messageId} lease expired at ${new Date(claim.leaseUntil).toISOString()}`,
        });
        repairedCount += 1;
      }
    }

    return { anomalies, repairedCount };
  }
}

export const stateReconciler = new StateReconciler();
