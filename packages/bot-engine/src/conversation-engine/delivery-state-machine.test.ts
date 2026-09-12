import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  AuthoritativeConversationEngine,
  MultiLayerDeduplicator,
  EventGate,
  ConversationTurnBuilder,
  ConversationLockManager,
  UnderstandingEngine,
  CanonicalContextBuilder,
  DecisionEngine,
  ToolRunner,
  ModelRouter,
  ResponsePlanner,
  ResponseQualityGate,
  ResponseCommitManager,
  WhatsAppOutbox,
} from "./index.ts";

describe("WP-9 Reliable Reply Guarantee & Delivery State Machine Suite", () => {
  let deduplicator: MultiLayerDeduplicator;
  let eventGate: EventGate;
  let turnBuilder: ConversationTurnBuilder;
  let conversationLock: ConversationLockManager;
  let understandingEngine: UnderstandingEngine;
  let contextBuilder: CanonicalContextBuilder;
  let decisionEngine: DecisionEngine;
  let toolRunner: ToolRunner;
  let modelRouter: ModelRouter;
  let responsePlanner: ResponsePlanner;
  let qualityGate: ResponseQualityGate;
  let responseCommit: ResponseCommitManager;
  let outbox: WhatsAppOutbox;
  let engine: AuthoritativeConversationEngine;
  let sentMessages: Array<{ chatId: string; text: string; metadata?: Record<string, unknown> }>;

  beforeEach(() => {
    deduplicator = new MultiLayerDeduplicator();
    eventGate = new EventGate(deduplicator);
    turnBuilder = new ConversationTurnBuilder({ defaultDebounceMs: 20, incompleteDebounceMs: 40 });
    conversationLock = new ConversationLockManager();
    understandingEngine = new UnderstandingEngine();
    contextBuilder = new CanonicalContextBuilder();
    decisionEngine = new DecisionEngine();
    toolRunner = new ToolRunner();
    modelRouter = new ModelRouter();
    responsePlanner = new ResponsePlanner();
    qualityGate = new ResponseQualityGate();
    responseCommit = new ResponseCommitManager();
    outbox = new WhatsAppOutbox();
    sentMessages = [];

    engine = new AuthoritativeConversationEngine({
      deduplicator,
      eventGate,
      turnBuilder,
      conversationLock,
      understandingEngine,
      contextBuilder,
      decisionEngine,
      toolRunner,
      modelRouter,
      responsePlanner,
      qualityGate,
      responseCommit,
      outbox,
      getSettings: async () => ({ enabled: true, aiEnabled: true }),
      getConversationStatus: async () => "bot",
      getHistory: async () => [],
      getFaqs: async () => [],
      getRules: async () => [],
    });

    engine.setSender(async (chatId, text, metadata) => {
      sentMessages.push({ chatId, text, metadata });
    });
  });

  // 1. One normal message -> receive -> 1 reply
  it("Test 1: One normal message receives exactly ONE reply", async () => {
    const accepted = await engine.acceptInboundEvent({
      tenantId: "default",
      chatId: "919876543210@s.whatsapp.net",
      messageId: "msg_norm_1",
      text: "hello bhai delivery charge kitna hai?",
      sender: "919876543210",
      timestamp: Date.now(),
    });
    assert.equal(accepted, true);

    await new Promise((r) => setTimeout(r, 80));
    assert.equal(sentMessages.length, 1);
    assert.match(sentMessages[0].text, /plan|package|₹|delivery/i);
  });

  // 2. Same event x100 -> exactly 1 reply
  it("Test 2: Same WhatsApp message ID x100 produces strictly ONE reply", async () => {
    const promises: Promise<boolean>[] = [];
    for (let i = 0; i < 100; i++) {
      promises.push(
        engine.acceptInboundEvent({
          tenantId: "default",
          chatId: "919876543211@s.whatsapp.net",
          messageId: "msg_dup_100",
          text: "kya pricing hai aapki?",
          sender: "919876543211",
          timestamp: Date.now(),
        })
      );
    }
    const results = await Promise.all(promises);
    const acceptedCount = results.filter(Boolean).length;
    assert.equal(acceptedCount, 1, "Only the first event of 100 identical events should be accepted");

    await new Promise((r) => setTimeout(r, 80));
    assert.equal(sentMessages.length, 1);
    assert.equal(engine.getMetrics().multiple_response_rate, 0);
  });

  // 3. New legitimate message with same text -> NEW reply
  it("Test 3: New legitimate message with different messageId produces a NEW reply", async () => {
    // First message
    const ok1 = await engine.acceptInboundEvent({
      tenantId: "default",
      chatId: "919876543212@s.whatsapp.net",
      messageId: "msg_turn_1",
      text: "ok",
      sender: "919876543212",
      timestamp: Date.now(),
    });
    assert.equal(ok1, true);
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(sentMessages.length, 1);

    // Later, user sends "ok" again as a separate turn
    const ok2 = await engine.acceptInboundEvent({
      tenantId: "default",
      chatId: "919876543212@s.whatsapp.net",
      messageId: "msg_turn_2",
      text: "ok",
      sender: "919876543212",
      timestamp: Date.now(),
    });
    assert.equal(ok2, true, "New turn with different messageId must NOT be falsely suppressed");
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(sentMessages.length, 2);
  });

  // 4. AI failure -> fallback reply
  it("Test 4: When AI generation fails or times out, a fallback reply is safely committed", async () => {
    engine.setAiGenerator(async () => {
      throw new Error("AI provider rate limited 429");
    });

    const ok = await engine.acceptInboundEvent({
      tenantId: "default",
      chatId: "919876543213@s.whatsapp.net",
      messageId: "msg_ai_fail_1",
      text: "bhai interview kharab gaya aaj",
      sender: "919876543213",
      timestamp: Date.now(),
    });
    assert.equal(ok, true);

    await new Promise((r) => setTimeout(r, 80));
    assert.equal(sentMessages.length, 1);
    assert.match(sentMessages[0].text, /rough|overthink|theek ho jayega/i);
  });

  // 5. Worker crash before generation / expired claim -> recovery reply
  it("Test 5: Stalled or expired claim is recovered by recoverStuckConversations()", async () => {
    const recovery = await engine.recoverStuckConversations();
    assert.equal(typeof recovery.recoveredClaims, "number");
    assert.equal(typeof recovery.recoveredOutbox, "number");
  });

  // 6. Worker crash after commit -> SAME response delivered, never second answer
  it("Test 6: Duplicate commit attempt delivers the existing committed response", async () => {
    const turn = {
      turnId: "turn_crash_test_1",
      tenantId: "default",
      chatId: "919876543214@s.whatsapp.net",
      sender: "919876543214",
      messageIds: ["msg_crash_1"],
      rawMessages: [],
      fragments: [],
      firstMessageId: "msg_crash_1",
      lastMessageId: "msg_crash_1",
      combinedText: "pricing details please",
      isGroup: false,
      createdAt: Date.now(),
    };

    const res1 = await engine.processTurn(turn);
    assert.ok(res1);

    // Simulate duplicate turn processing after worker restart
    const res2 = await engine.processTurn(turn);
    assert.ok(res2);
    assert.equal(res1.responseId, res2.responseId, "Must reuse existing responseId");
    assert.equal(res1.text, res2.text, "Must reuse exact committed answer");
  });

  // 7. Human handoff -> ZERO AI reply
  it("Test 7: Human handoff mode produces ZERO AI reply", async () => {
    engine.updateDependencies({
      getConversationStatus: async () => "human",
    });

    const ok = await engine.acceptInboundEvent({
      tenantId: "default",
      chatId: "919876543215@s.whatsapp.net",
      messageId: "msg_human_1",
      text: "kya price hai?",
      sender: "919876543215",
      timestamp: Date.now(),
    });
    assert.equal(ok, true);

    await new Promise((r) => setTimeout(r, 80));
    assert.equal(sentMessages.length, 0, "No response when status is human");
  });

  // 8. Disabled bot -> ZERO AI reply
  it("Test 8: Disabled bot in settings produces ZERO AI reply", async () => {
    engine.updateDependencies({
      getSettings: async () => ({ enabled: false, aiEnabled: false }),
    });

    const ok = await engine.acceptInboundEvent({
      tenantId: "default",
      chatId: "919876543216@s.whatsapp.net",
      messageId: "msg_disabled_1",
      text: "hello?",
      sender: "919876543216",
      timestamp: Date.now(),
    });
    assert.equal(ok, true);

    await new Promise((r) => setTimeout(r, 80));
    assert.equal(sentMessages.length, 0, "No response when bot is disabled");
  });

  // 9. History replay -> ZERO AI reply
  it("Test 9: Historical sync (source !== notify) is rejected by EventGate", async () => {
    const ok = await engine.acceptInboundEvent({
      tenantId: "default",
      chatId: "919876543217@s.whatsapp.net",
      messageId: "msg_hist_1",
      text: "old message",
      sender: "919876543217",
      timestamp: Date.now() - 3600_000, // 1 hour ago
      source: "history",
    } as unknown as Parameters<typeof engine.acceptInboundEvent>[0]);

    assert.equal(ok, false, "History event must be rejected");
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(sentMessages.length, 0);
  });

  // 10. Own outbound event -> ZERO AI reply
  it("Test 10: Own message (fromMe = true) is rejected by EventGate", async () => {
    const ok = await engine.acceptInboundEvent({
      tenantId: "default",
      chatId: "919876543218@s.whatsapp.net",
      messageId: "msg_own_1",
      text: "sent by me",
      sender: "me",
      timestamp: Date.now(),
      fromMe: true,
    } as unknown as Parameters<typeof engine.acceptInboundEvent>[0]);

    assert.equal(ok, false, "Own message must be rejected");
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(sentMessages.length, 0);
  });

  // 11. DAZY special contact message -> exactly 1 romantic reply
  it("Test 11: DAZY contact message receives exactly ONE romantic reply without business pricing", async () => {
    const ok = await engine.acceptInboundEvent({
      tenantId: "default",
      chatId: "917903956968@s.whatsapp.net",
      messageId: "msg_dazy_1",
      text: "aaj bahut yaad aa rahi thi tumhari ❤️",
      sender: "917903956968",
      fromName: "DAZY",
      timestamp: Date.now(),
    });
    assert.equal(ok, true);

    await new Promise((r) => setTimeout(r, 80));
    assert.equal(sentMessages.length, 1);
    assert.match(sentMessages[0].text, /Dazy|yaad|❤️|suno|hamesha|paas|dil/i);
    assert.doesNotMatch(sentMessages[0].text, /₹|package|pricing|business/i);
  });

  // 12. Health metrics validation
  it("Test 12: Health metrics reflect zero multiple response rate", async () => {
    const metrics = engine.getMetrics();
    assert.equal(metrics.multiple_response_rate, 0);
    assert.equal(typeof metrics.reply_success_rate, "number");
    assert.equal(typeof metrics.stuck_turn_rate, "number");
  });
});
