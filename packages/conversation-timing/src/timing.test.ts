import test from 'node:test';
import assert from 'node:assert/strict';
import {
  presenceController,
  turnDetector,
  supersessionManager,
  timingPlanner,
  type PresenceState,
} from './index.ts';

test('Conversation Timing: PresenceController manages presence and invokes adapter', async () => {
  let recordedState: PresenceState | null = null;
  presenceController.setAdapter(async (_chatId, state) => {
    recordedState = state;
  });

  await presenceController.setPresence('chat_123', 'composing');
  assert.equal(recordedState, 'composing');
  assert.equal(presenceController.getPresence('chat_123'), 'composing');

  presenceController.clearPresence('chat_123');
  assert.equal(presenceController.getPresence('chat_123'), undefined);
});

test('Conversation Timing: TurnDetector recognizes incomplete thoughts and urgent bypass', () => {
  // Incomplete intro
  const dec1 = turnDetector.evaluate('sun ek baat...', 0, 1000);
  assert.equal(dec1.action, 'WAIT_FOR_MORE');
  assert.equal(dec1.isUrgent, false);

  // Urgent emergency message
  const dec2 = turnDetector.evaluate('urgent help needed accident ho gaya', 0, 1000);
  assert.equal(dec2.action, 'RESPOND_NOW');
  assert.equal(dec2.isUrgent, true);

  // Complete thought
  const dec3 = turnDetector.evaluate('Please send me your portfolio link', 0, 5000);
  assert.equal(dec3.action, 'RESPOND_NOW');
});

test('Conversation Timing: SupersessionManager cancels in-flight draft when user interrupts', () => {
  const abortCtrl = new AbortController();
  supersessionManager.registerPending({
    responseId: 'resp_old_1',
    turnId: 'turn_1',
    chatId: 'chat_456',
    conversationVersion: 10,
    createdAt: Date.now(),
    abortController: abortCtrl,
  });

  // User sends cancellation
  const cancelCheck = supersessionManager.checkInterruption('chat_456', 'nahi rehne do', 10);
  assert.equal(cancelCheck.isInterrupted, true);
  assert.equal(cancelCheck.cancelledResponseId, 'resp_old_1');
  assert.equal(abortCtrl.signal.aborted, true);
});

test('Conversation Timing: TimingPlanner calculates bounded natural delays', () => {
  // Urgent: 0ms delay
  const urgentPlan = timingPlanner.plan('Emergency response', true);
  assert.equal(urgentPlan.totalDelayMs, 0);

  // Short response: ~800ms total
  const shortPlan = timingPlanner.plan('haan', false);
  assert.equal(shortPlan.composingDurationMs, 500);

  // Long response: bounded ceiling ~2100ms
  const longPlan = timingPlanner.plan('A'.repeat(200), false);
  assert.equal(longPlan.composingDurationMs, 1800);
});
