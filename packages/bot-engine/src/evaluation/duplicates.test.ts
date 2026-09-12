import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MultiLayerDeduplicator,
  EventGate,
  ResponseCommitManager,
  type InboundEventPayload,
  type ResponsePlan,
} from "../conversation-engine/index.ts";

describe("WP-9 Master Evaluation Suite: Deduplication & Single Response Invariant", () => {
  it("same event × 100 results in strictly ONE accepted event", async () => {
    const dedup = new MultiLayerDeduplicator();
    const gate = new EventGate(dedup);
    const event: InboundEventPayload = {
      tenantId: "default",
      chatId: "919114411026@s.whatsapp.net",
      messageId: "msg_dup_100_test",
      text: "hello world",
      timestamp: Date.now(),
      sender: "919114411026@s.whatsapp.net",
    };

    let accepted = 0;
    for (let i = 0; i < 100; i++) {
      const res = await gate.acceptEvent(event);
      if (res.accepted) {
        accepted++;
      }
    }

    assert.equal(accepted, 1, "Exactly one event must be accepted from 100 identical attempts");
  });

  it("same message ID × 100 results in strictly ONE unique dedup record", async () => {
    const dedup = new MultiLayerDeduplicator();
    const messageId = "msg_unique_claim_test";
    const chatId = "919114411026@s.whatsapp.net";
    const senderId = "919114411026@s.whatsapp.net";
    const text = "pricing inquiry";

    let uniqueClaims = 0;
    for (let i = 0; i < 100; i++) {
      const isDup = await dedup.isDuplicateInbound({
        eventId: `evt_${messageId}_${i}`,
        messageId,
        chatId,
        senderId,
        text,
        timestamp: Date.now(),
      });
      if (!isDup.isDuplicate) {
        const recorded = await dedup.recordInbound({
          eventId: `evt_${messageId}_${i}`,
          messageId,
          chatId,
          senderId,
          text,
          timestamp: Date.now(),
        });
        if (recorded) {
          uniqueClaims++;
        }
      }
    }

    assert.equal(uniqueClaims, 1, "Must allow strictly 1 claim across 100 calls");
  });

  it("messages.update and messaging-history.set NEVER produce conversational replies", async () => {
    const gate = new EventGate();
    const updateEvent = {
      tenantId: "default",
      chatId: "919114411026@s.whatsapp.net",
      messageId: "msg_update_test",
      text: "updated text",
      timestamp: Date.now(),
      sender: "919114411026@s.whatsapp.net",
      isEdit: true, // or source === 'update'
      source: "update",
    };

    const res = await gate.acceptEvent(updateEvent);
    assert.equal(res.accepted, false);
  });

  it("atomic response commit permits strictly ONE response per turnId", async () => {
    const commitMgr = new ResponseCommitManager();
    const turnId = "turn_strict_one_12345";
    const chatId = "919114411026@s.whatsapp.net";

    const plan1: ResponsePlan = {
      responseId: "resp_worker1_001",
      turnId,
      chatId,
      intent: "general",
      modelUsed: "fast",
      tone: "humble",
      suggestedLength: "short",
      requiresTools: false,
      isDazy: false,
    };

    const plan2: ResponsePlan = {
      responseId: "resp_worker2_002",
      turnId,
      chatId,
      intent: "general",
      modelUsed: "fast",
      tone: "humble",
      suggestedLength: "short",
      requiresTools: false,
      isDazy: false,
    };

    // Worker 1 commits response
    const firstCommit = await commitMgr.commitResponse({
      turnId,
      chatId,
      finalText: "First response from worker 1",
      plan: plan1,
    });
    assert.equal(firstCommit.isDuplicateAttempt, false);
    assert.equal(firstCommit.committedResponse.responseId, "resp_worker1_001");

    // Worker 2 attempts racing commit for the same turnId
    const secondCommit = await commitMgr.commitResponse({
      turnId,
      chatId,
      finalText: "Second conflicting response from worker 2",
      plan: plan2,
    });
    assert.equal(secondCommit.isDuplicateAttempt, true, "Second response for same turn MUST be flagged as duplicate");
    assert.equal(secondCommit.committedResponse.responseId, "resp_worker1_001", "Must preserve the first committed response");
  });
});
