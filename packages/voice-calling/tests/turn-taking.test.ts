import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { CallStateMachine } from "../src/call-state.js";
import { CallTurnManager } from "../src/intelligence/turn-manager.js";
import { ThinkingFillerManager } from "../src/intelligence/thinking-filler.js";

describe("Turn-Taking, State Machine & Barge-In Cut-off", () => {
  test("CallStateMachine allows legal transitions and blocks illegal transitions", () => {
    const sm = new CallStateMachine("IDLE");
    assert.equal(sm.getState(), "IDLE");

    // Legal transitions
    assert.ok(sm.transition("INCOMING", "Incoming call"));
    assert.equal(sm.getState(), "INCOMING");

    assert.ok(sm.transition("ANSWERING", "User answered"));
    assert.equal(sm.getState(), "ANSWERING");

    assert.ok(sm.transition("CONNECTED", "Audio channel connected"));
    assert.equal(sm.getState(), "CONNECTED");

    assert.ok(sm.transition("LISTENING", "Awaiting speech"));
    assert.equal(sm.getState(), "LISTENING");

    // Illegal transition: LISTENING -> ANSWERING
    const illegal = sm.transition("ANSWERING", "Should fail");
    assert.equal(illegal, false);
    assert.equal(sm.getState(), "LISTENING");
  });

  test("CallTurnManager triggers barge-in event when caller speaks while bot is speaking", () => {
    let bargeInFired = false;
    const turnManager = new CallTurnManager({
      onBargeIn: () => {
        bargeInFired = true;
      },
    });

    // Caller finishes speech -> bot thinks -> bot speaks
    turnManager.onCallerFinished();
    assert.equal(turnManager.getState(), "BOT_THINKING");

    turnManager.onBotStartsSpeaking();
    assert.equal(turnManager.getState(), "BOT_SPEAKING");

    // Caller interrupts while bot is speaking
    turnManager.onCallerSpeechDetected();
    assert.equal(bargeInFired, true);
    assert.equal(turnManager.getState(), "CALLER_SPEAKING");
    assert.equal(turnManager.getBargeInCount(), 1);
  });

  test("ThinkingFillerManager enforces cooldown between filler phrases", () => {
    const filler = new ThinkingFillerManager(10_000); // 10s cooldown

    // After 800ms of thinking, filler is allowed
    assert.ok(filler.shouldPlayFiller(800));
    const f1 = filler.getNextFiller();
    assert.ok(f1.length > 0);

    // Immediately after, cooldown blocks another filler
    assert.equal(filler.shouldPlayFiller(1200), false);
  });
});
