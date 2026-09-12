import test from 'node:test';
import assert from 'node:assert/strict';
import {
  systemInvariantChecker,
  healthEvaluator,
  stateReconciler,
  incidentDetector,
  replayEngine,
} from './index.ts';

test('Control Plane: System Invariants verification', () => {
  // 1. Single response per turn
  const singleViolation = systemInvariantChecker.verifySingleResponsePerTurn('turn-101', [
    { responseId: 'resp-1', turnId: 'turn-101' },
    { responseId: 'resp-2', turnId: 'turn-101' },
  ]);
  assert.ok(singleViolation !== null);
  assert.equal(singleViolation?.invariantId, 'INV_01_SINGLE_RESPONSE_PER_TURN');

  const cleanCheck = systemInvariantChecker.verifySingleResponsePerTurn('turn-102', [
    { responseId: 'resp-3', turnId: 'turn-102' },
  ]);
  assert.equal(cleanCheck, null);

  // 2. Response freshness
  const staleViolation = systemInvariantChecker.verifyResponseFreshness(1, 2);
  assert.ok(staleViolation !== null);
  assert.equal(staleViolation?.invariantId, 'INV_04_STALE_RESPONSE_NEVER_DELIVERED');

  const freshCheck = systemInvariantChecker.verifyResponseFreshness(3, 3);
  assert.equal(freshCheck, null);
});

test('Control Plane: Layered Health Evaluator L0-L9', () => {
  const healthy = healthEvaluator.evaluate({
    isWorkerAlive: true,
    isWhatsappConnected: true,
    isDatabaseConnected: true,
    isQueueHealthy: true,
    circuitBreakersTripped: 0,
    hasIntegrityViolations: false,
    stuckClaimsCount: 0,
  });

  assert.equal(healthy.overall, 'HEALTHY');
  assert.equal(healthy.layers.l0_process.status, 'HEALTHY');
  assert.equal(healthy.layers.l1_transport.status, 'HEALTHY');
  assert.equal(healthy.layers.l2_database.status, 'HEALTHY');
  assert.equal(healthy.layers.l9_data_integrity.status, 'HEALTHY');

  // Degraded when WhatsApp disconnected
  const degraded = healthEvaluator.evaluate({
    isWorkerAlive: true,
    isWhatsappConnected: false,
    isDatabaseConnected: true,
  });
  assert.equal(degraded.overall, 'DEGRADED');
  assert.equal(degraded.layers.l1_transport.status, 'NOT_READY');

  // Failed when database is down or integrity violation occurs
  const failed = healthEvaluator.evaluate({
    isWorkerAlive: true,
    isWhatsappConnected: true,
    isDatabaseConnected: false,
  });
  assert.equal(failed.overall, 'FAILED');
});

test('Control Plane: State Reconciler anomaly detection', () => {
  const past = Date.now() - 30000;
  const audit = stateReconciler.reconcile({
    claims: [
      { messageId: 'msg-1', status: 'CLAIMED', leaseUntil: past },
    ],
    turns: [
      { turnId: 'turn-1', status: 'COMPLETED' },
    ],
    responses: [
      { responseId: 'resp-1', turnId: 'turn-1', status: 'COMMITTED' },
      { responseId: 'resp-2', turnId: 'non-existent-turn', status: 'COMMITTED' },
    ],
    outbox: [
      { responseId: 'resp-2', status: 'PENDING' },
    ],
  });

  assert.equal(audit.anomalies.length, 3);
  assert.ok(audit.anomalies.some((a) => a.anomalyType === 'ORPHAN_RESPONSE'));
  assert.ok(audit.anomalies.some((a) => a.anomalyType === 'MISSING_OUTBOX_ITEM'));
  assert.ok(audit.anomalies.some((a) => a.anomalyType === 'STUCK_CLAIM'));
  assert.equal(audit.repairedCount, 1);
});

test('Control Plane: Incident Detector and Replay Engine', async () => {
  // Incident Detector
  const alert = incidentDetector.checkDeliveryFailureRate({
    totalSent: 10,
    totalFailed: 4,
    windowSeconds: 60,
  });
  assert.ok(alert !== null);
  assert.equal(alert?.type, 'DELIVERY_FAILURE_SPIKE');
  assert.equal(alert?.severity, 'P2');

  const dupAlert = incidentDetector.checkDuplicateDeliveryAttempt('resp-99', 2);
  assert.ok(dupAlert !== null);
  assert.equal(dupAlert?.type, 'DUPLICATE_DELIVERY_ATTEMPT');

  // Replay Engine
  const replayResult = await replayEngine.replayTurn(
    {
      turnId: 'turn-replay-1',
      senderId: 'user-1',
      messageText: 'What is my name?',
      recordedFacts: [{ key: 'name', value: 'Alex' }],
      originalResponse: 'Your name is Alex.',
      timestamp: Date.now(),
    },
    async (ctx) => `Your name is ${ctx.facts['name']}.`
  );

  assert.equal(replayResult.matchesOriginal, true);
  assert.equal(replayResult.simulatedOutput, 'Your name is Alex.');
});
