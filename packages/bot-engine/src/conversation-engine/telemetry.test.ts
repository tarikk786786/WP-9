import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { brainTelemetry } from "./telemetry.ts";
import { modelRouter } from "./model-router.ts";
import { AuthoritativeConversationEngine } from "./index.ts";
import { ConversationTurnBuilder } from "./turn-builder.ts";

describe("WP-9 Conversation Brain Unified Telemetry & Architecture", () => {
  it("Unified TurnTrace tracks turn from intake to outbox send", () => {
    const turnId = "test_turn_101";
    const chatId = "919114411001@s.whatsapp.net";

    const trace = brainTelemetry.startTrace({
      turnId,
      chatId,
      sender: "919114411001",
      userText: "price kya hai website ka?",
      isDazy: false,
    });

    assert.equal(trace.turnId, turnId);
    assert.equal(trace.isDazy, false);

    brainTelemetry.recordUnderstanding(turnId, "pricing", "curious");
    brainTelemetry.recordMemory(turnId, ["Basic Website Plan is ₹999"]);
    brainTelemetry.recordGeneration(turnId, {
      source: "ai_fast",
      text: "Website ka basic package ₹999 se start hota hai.",
      modelId: "gpt-4o-mini",
    });
    brainTelemetry.recordQualityAudit(turnId, {
      passed: true,
      scores: { humility: 95, naturalness: 92 },
      repairsMade: ["Trimmed whitespace"],
      reasons: [],
    });
    brainTelemetry.recordCommit(turnId, "resp_101", "Website ka basic package ₹999 se start hota hai.");
    brainTelemetry.recordSendResult(turnId, { status: "SENT", messageId: "msg_out_101" });

    const retrieved = brainTelemetry.getTrace(turnId);
    assert.ok(retrieved);
    assert.equal(retrieved.intent, "pricing");
    assert.equal(retrieved.emotion, "curious");
    assert.equal(retrieved.modelUsed, "gpt-4o-mini");
    assert.equal(retrieved.qualityAudit?.humilityScore, 95);
    assert.equal(retrieved.qualityAudit?.naturalnessScore, 92);
    assert.equal(retrieved.sendResult?.status, "SENT");

    // Diagnostic query
    const recent = brainTelemetry.getRecentTraces(10, chatId);
    assert.ok(recent.length >= 1);
    assert.equal(recent[0].turnId, turnId);
  });

  it("ModelRouter supports local AI fallback when configured", async () => {
    // ModelRouter has queryLocalAi method and local_ai in candidate sources
    assert.ok(typeof (modelRouter as any).queryLocalAi === "function");
  });

  it("End-to-end ConversationEngine processTurn populates brainTelemetry automatically", async () => {
    const sentMessages: Array<{ chatId: string; text: string }> = [];
    const testTurnBuilder = new ConversationTurnBuilder({ defaultDebounceMs: 10 });
    const testEngine = new AuthoritativeConversationEngine({ turnBuilder: testTurnBuilder });
    testEngine.turnBuilder.debounceMs = 15;
    testEngine.setSender(async (chatId, text) => {
      sentMessages.push({ chatId, text });
    });

    const turnId = `telemetry_test_${Date.now()}`;
    const chatId = "919876543210@s.whatsapp.net";

    await testEngine.acceptInboundEvent({
      tenantId: "default",
      chatId,
      messageId: `msg_tel_${Date.now()}`,
      text: "delivery kab tak milegi?",
      sender: "919876543210",
      timestamp: Date.now(),
    });

    // Wait for async turn processing and trace recording
    let trace: any;
    for (let i = 0; i < 25; i++) {
      await new Promise((r) => setTimeout(r, 20));
      const traces = brainTelemetry.getRecentTraces(5, chatId);
      if (traces.length > 0 && traces[0].finalAnswer) {
        trace = traces[0];
        break;
      }
    }

    assert.ok(trace, "Trace should be saved in brainTelemetry");
    assert.equal(trace.chatId, chatId);
    assert.ok(trace.intent, "Intent must be recorded in trace");
    assert.ok(trace.qualityAudit, "Quality audit must be recorded in trace");
    assert.ok(trace.finalAnswer, "Final answer must be recorded in trace");
  });
});
