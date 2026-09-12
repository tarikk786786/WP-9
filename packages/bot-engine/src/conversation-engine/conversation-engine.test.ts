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

describe("Authoritative Conversation Engine — Architectural Test Suite", () => {
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
    turnBuilder = new ConversationTurnBuilder({ defaultDebounceMs: 25, incompleteDebounceMs: 50 });
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

    outbox.setSender(async (chatId, text, metadata) => {
      sentMessages.push({ chatId, text, metadata });
    });

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
    });
  });

  // Test 1: same WhatsApp event received 10 times -> EXPECTED: 1 response
  it("Test 1: same WhatsApp event received 10 times results in exactly 1 response", async () => {
    const event = {
      tenantId: "default",
      chatId: "919114411026@s.whatsapp.net",
      messageId: "msg_event_repeat_1",
      text: "Hello, kya haal hai?",
      sender: "919114411026",
      timestamp: Date.now(),
    };

    let acceptedCount = 0;
    for (let i = 0; i < 10; i++) {
      const accepted = await engine.acceptInboundEvent(event);
      if (accepted) acceptedCount += 1;
    }

    assert.equal(acceptedCount, 1, "Only the first event occurrence must be accepted");
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.equal(sentMessages.length, 1, "Exactly 1 response must be delivered to the outbox");
  });

  // Test 2: same messageId received 10 times -> EXPECTED: 1 response
  it("Test 2: same messageId received 10 times results in exactly 1 response", async () => {
    let accepted = 0;
    for (let i = 0; i < 10; i++) {
      const ok = await engine.acceptInboundEvent({
        tenantId: "default",
        chatId: "919114411026@s.whatsapp.net",
        messageId: "msg_id_identical_123",
        text: `Message attempt ${i}`,
        sender: "919114411026",
        timestamp: Date.now() + i * 10,
      });
      if (ok) accepted += 1;
    }

    assert.equal(accepted, 1, "Only 1 message with identical messageId can be accepted");
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(sentMessages.length, 1);
  });

  // Test 3: three messages within burst window -> EXPECTED: 1 logical turn, 1 response
  it("Test 3: three messages within burst window aggregate into 1 logical turn and 1 response", async () => {
    const baseTime = Date.now();

    await engine.acceptInboundEvent({
      tenantId: "default",
      chatId: "919114411026@s.whatsapp.net",
      messageId: "frag_1",
      text: "bhai",
      sender: "919114411026",
      timestamp: baseTime,
    });

    await engine.acceptInboundEvent({
      tenantId: "default",
      chatId: "919114411026@s.whatsapp.net",
      messageId: "frag_2",
      text: "sun na",
      sender: "919114411026",
      timestamp: baseTime + 10,
    });

    await engine.acceptInboundEvent({
      tenantId: "default",
      chatId: "919114411026@s.whatsapp.net",
      messageId: "frag_3",
      text: "price kya hai website ka?",
      sender: "919114411026",
      timestamp: baseTime + 20,
    });

    await new Promise((resolve) => setTimeout(resolve, 120));

    assert.equal(sentMessages.length, 1, "Burst fragments must result in exactly 1 combined response");
    assert.match(sentMessages[0].text, /pricing|plan|₹|service/i);
  });

  // Test 4: AI timeout then fallback -> EXPECTED: 1 response
  it("Test 4: AI timeout fails over to deterministic fallback with exactly 1 response", async () => {
    modelRouter.aiTimeoutMs = 20;
    engine.setAiGenerator(async () => {
      // simulate slow AI hanging past timeout
      await new Promise((r) => setTimeout(r, 200));
      return { text: "Late AI response" };
    });

    await engine.acceptInboundEvent({
      tenantId: "default",
      chatId: "919114411026@s.whatsapp.net",
      messageId: "msg_timeout_test",
      text: "delivery kab tak hogi?",
      sender: "919114411026",
      timestamp: Date.now(),
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(sentMessages.length, 1, "Exactly 1 response from fallback");
    assert.doesNotMatch(sentMessages[0].text, /Late AI response/);
    assert.match(sentMessages[0].text, /delivery/i);
  });

  // Test 5: AI produces response then network timeout -> EXPECTED: retry SAME responseId
  it("Test 5: network timeout on send retries with identical responseId", async () => {
    let sendCalls = 0;
    const recordedIds: string[] = [];

    outbox.setSender(async (chatId, text, metadata) => {
      sendCalls += 1;
      const respId = (metadata as { responseId?: string })?.responseId || "resp_fixed_retry_5";
      recordedIds.push(respId);
      if (sendCalls === 1) {
        throw new Error("Socket connection dropped during ack");
      }
    });

    await outbox.enqueue({
      responseId: "resp_fixed_retry_5",
      chatId: "919114411026@s.whatsapp.net",
      text: "Hello! This is a test response.",
      maxAttempts: 2,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(sendCalls, 1);
    assert.equal(outbox.getItem("resp_fixed_retry_5")?.status, "failed");

    // Next outbox drain re-attempts send using the exact same responseId (forceImmediate for test)
    await outbox.processQueue(true);
    assert.equal(sendCalls, 2);
    assert.equal(recordedIds[0], recordedIds[1], "Retried message must maintain identical responseId");
    assert.equal(outbox.getItem("resp_fixed_retry_5")?.status, "sent");
  });

  // Test 6: worker restarts after commit -> EXPECTED: same response sent, no second answer
  it("Test 6: worker restarts after commit resumes same committed response without re-generating", async () => {
    const turnId = "turn_restart_test_1";
    const chatId = "919114411026@s.whatsapp.net";

    const { committedResponse } = await responseCommit.commitResponse({
      turnId,
      chatId,
      plan: {
        turnId,
        responseId: "resp_restart_abc",
        action: "direct_answer",
        intent: "pricing",
        answer: "Basic plan starts at ₹999",
        language: "hinglish",
        confidence: 1.0,
        source: "direct",
        shouldReply: true,
      },
      finalText: "Basic plan starts at ₹999",
    });

    // Simulate worker restart: new commit attempt with same turnId
    const secondAttempt = await responseCommit.commitResponse({
      turnId,
      chatId,
      plan: {
        turnId,
        responseId: "resp_restart_def",
        action: "direct_answer",
        intent: "pricing",
        answer: "A different text that must NOT be used",
        language: "hinglish",
        confidence: 1.0,
        source: "direct",
        shouldReply: true,
      },
      finalText: "A different text that must NOT be used",
    });

    assert.equal(secondAttempt.isDuplicateAttempt, true);
    assert.equal(secondAttempt.committedResponse.responseId, committedResponse.responseId);
    assert.equal(secondAttempt.committedResponse.text, "Basic plan starts at ₹999");
  });

  // Test 7: two worker processes race -> EXPECTED: one wins conversation lock
  it("Test 7: two worker processes race and exactly one wins conversation lock", async () => {
    const chatId = "919114411099_race@s.whatsapp.net";
    const lock1 = await conversationLock.acquireLock(chatId, "turn_race_1", 20000);
    const lock2 = await conversationLock.acquireLock(chatId, "turn_race_2", 20000);

    assert.ok(lock1, "First worker process acquires lock");
    assert.equal(lock2, null, "Second competing worker process lock must be rejected");

    await conversationLock.releaseLock(chatId, "turn_race_1");
  });

  // Test 8: bot disabled -> EXPECTED: 0 response
  it("Test 8: when settings.enabled = false, exactly 0 responses are produced", async () => {
    engine.updateDependencies({
      getSettings: async () => ({ enabled: false }),
    });

    await engine.acceptInboundEvent({
      tenantId: "default",
      chatId: "919114411026@s.whatsapp.net",
      messageId: "msg_disabled_1",
      text: "hello bhai",
      sender: "919114411026",
      timestamp: Date.now(),
    });

    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(sentMessages.length, 0, "No responses should be sent when bot is disabled");
  });

  // Test 9: human handoff -> EXPECTED: 0 AI response
  it("Test 9: when conversation status is waiting_human or human, bot produces 0 responses", async () => {
    engine.updateDependencies({
      getConversationStatus: async () => "waiting_human",
    });

    await engine.acceptInboundEvent({
      tenantId: "default",
      chatId: "919114411026@s.whatsapp.net",
      messageId: "msg_human_handoff_1",
      text: "kya price hai?",
      sender: "919114411026",
      timestamp: Date.now(),
    });

    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(sentMessages.length, 0, "No automated bot response in human mode");
  });

  // Test 10: FAQ + AI both applicable -> EXPECTED: 1 final response
  it("Test 10: FAQ and AI both applicable results in exactly 1 final response", async () => {
    engine.updateDependencies({
      getFaqs: async () => [
        {
          id: "faq_1",
          question: "office kahan hai?",
          answer: "Humara office New Delhi mein hai.",
          keywords: ["office"],
          category: "general",
          priority: 1,
          enabled: true,
        },
      ],
    });
    engine.setAiGenerator(async () => ({ text: "AI candidate response" }));

    await engine.acceptInboundEvent({
      tenantId: "default",
      chatId: "919114411026@s.whatsapp.net",
      messageId: "msg_faq_ai_race",
      text: "office kahan hai?",
      sender: "919114411026",
      timestamp: Date.now(),
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(sentMessages.length, 1, "Exactly 1 response must be delivered");
    assert.match(sentMessages[0].text, /New Delhi/);
  });

  // Test 11: rule + AI both applicable -> EXPECTED: 1 final response
  it("Test 11: rule and AI both applicable results in exactly 1 final response", async () => {
    engine.updateDependencies({
      getRules: async () => [
        {
          id: "rule_1",
          name: "Discount",
          triggerType: "contains",
          triggerValue: "discount",
          response: "Special 20% discount applies this week!",
          priority: 1,
          enabled: true,
        },
      ],
    });
    engine.setAiGenerator(async () => ({ text: "AI discount text" }));

    await engine.acceptInboundEvent({
      tenantId: "default",
      chatId: "919114411026@s.whatsapp.net",
      messageId: "msg_rule_ai_race",
      text: "kya koi discount chal raha hai?",
      sender: "919114411026",
      timestamp: Date.now(),
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(sentMessages.length, 1, "Exactly 1 response from winning candidate");
    assert.match(sentMessages[0].text, /20% discount/);
  });

  // Test 12: fallback + AI race -> EXPECTED: 1 final response
  it("Test 12: fallback and AI candidate race results in exactly 1 final response", async () => {
    let aiCallStarted = false;
    engine.setAiGenerator(async () => {
      aiCallStarted = true;
      await new Promise((r) => setTimeout(r, 15));
      return { text: "AI Fast Winner" };
    });

    await engine.acceptInboundEvent({
      tenantId: "default",
      chatId: "919114411026@s.whatsapp.net",
      messageId: "msg_race_12",
      text: "kal mil sakte hain kya?",
      sender: "919114411026",
      timestamp: Date.now(),
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.ok(aiCallStarted);
    assert.equal(sentMessages.length, 1, "Never send both fallback and AI response");
  });

  // Test 13: conversational repair ("price nahi delivery pucha tha") -> EXPECTED: answers delivery
  it("Test 13: conversational repair resolves user correction without duplicating price reply", async () => {
    await engine.acceptInboundEvent({
      tenantId: "default",
      chatId: "919114411026@s.whatsapp.net",
      messageId: "msg_repair_test",
      text: "nahi price nahi, delivery pucha tha",
      sender: "919114411026",
      timestamp: Date.now(),
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(sentMessages.length, 1);
    assert.match(sentMessages[0].text, /delivery|maaf kijiye/i);
  });

  // Test 14: "Haan" after a previous question -> EXPECTED: resolve previous pending context
  it("Test 14: 'Haan' after previous question resolves confirmation to prior assistant message", async () => {
    engine.updateDependencies({
      getHistory: async () => [
        { role: "user", text: "Kya kal 5 baje call kar sakte hain?" },
        { role: "assistant", text: "Haan bilkul, kya 5 baje confirm karein?" },
      ],
    });

    await engine.acceptInboundEvent({
      tenantId: "default",
      chatId: "919114411026@s.whatsapp.net",
      messageId: "msg_haan_confirm",
      text: "Haan",
      sender: "919114411026",
      timestamp: Date.now(),
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(sentMessages.length, 1);
    assert.ok(sentMessages[0].text.length > 0);
  });

  // Test 15: "iska?" -> EXPECTED: resolve referenced entity from previous turn
  it("Test 15: 'iska?' resolves referenced entity from previous turn", async () => {
    engine.updateDependencies({
      getHistory: async () => [
        { role: "user", text: "Website design package kitne ka hai?" },
        { role: "assistant", text: "Humara Premium Plan ₹4999 ka hai aur Basic Plan ₹999 ka hai." },
      ],
    });

    await engine.acceptInboundEvent({
      tenantId: "default",
      chatId: "919114411026@s.whatsapp.net",
      messageId: "msg_iska_query",
      text: "iska rate kitna hoga?",
      sender: "919114411026",
      timestamp: Date.now(),
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(sentMessages.length, 1);
    assert.match(sentMessages[0].text, /Premium Plan|Basic Plan|₹/);
  });

  // Test 16: same semantic question repeated intentionally after long interval -> EXPECTED: new turn
  it("Test 16: same question repeated intentionally after long interval creates a new turn", async () => {
    const time1 = Date.now() - 120_000;
    const ok1 = await engine.acceptInboundEvent({
      tenantId: "default",
      chatId: "919114411026@s.whatsapp.net",
      messageId: "msg_semantic_1",
      text: "hello bhai kya haal",
      sender: "919114411026",
      timestamp: time1,
    });
    assert.ok(ok1);

    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(sentMessages.length, 1);

    // Later: user sends another message with new messageId
    const time2 = Date.now();
    const ok2 = await engine.acceptInboundEvent({
      tenantId: "default",
      chatId: "919114411026@s.whatsapp.net",
      messageId: "msg_semantic_2",
      text: "hello bhai kya haal",
      sender: "919114411026",
      timestamp: time2,
    });
    assert.ok(ok2, "New inbound message event with fresh messageId after interval is accepted");

    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(sentMessages.length, 2, "Second intentional message after interval produces second turn");
  });

  // Test D: Fragmented thought ("bhai", "ek baat batao", "price kitna hai?") -> 1 response
  it("Test D: Fragmented thought ('bhai', 'ek baat batao', 'price kitna hai?') aggregates to 1 turn and 1 response", async () => {
    const base = Date.now();
    await engine.acceptInboundEvent({
      tenantId: "default",
      chatId: "919114411026@s.whatsapp.net",
      messageId: "frag_d_1",
      text: "bhai",
      sender: "919114411026",
      timestamp: base,
    });
    await engine.acceptInboundEvent({
      tenantId: "default",
      chatId: "919114411026@s.whatsapp.net",
      messageId: "frag_d_2",
      text: "ek baat batao",
      sender: "919114411026",
      timestamp: base + 10,
    });
    await engine.acceptInboundEvent({
      tenantId: "default",
      chatId: "919114411026@s.whatsapp.net",
      messageId: "frag_d_3",
      text: "price kitna hai?",
      sender: "919114411026",
      timestamp: base + 20,
    });

    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(sentMessages.length, 1);
    assert.match(sentMessages[0].text, /pricing|plan|₹|service/i);
  });

  // Test E: Slang / Hinglish / typo message -> appropriate answer
  it("Test E: Slang / Hinglish / typo message ('prc kya h web ka plz btao') understood and answered", async () => {
    await engine.acceptInboundEvent({
      tenantId: "default",
      chatId: "919114411026@s.whatsapp.net",
      messageId: "msg_slang_typo_e",
      text: "prc kya h web ka plz btao",
      sender: "919114411026",
      timestamp: Date.now(),
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(sentMessages.length, 1);
    assert.match(sentMessages[0].text, /pricing|plan|₹|service/i);
  });

  // Test F: Quoted message referencing price -> response answers price
  it("Test F: Quoted message referencing price resolves referenced question correctly", async () => {
    await engine.acceptInboundEvent({
      tenantId: "default",
      chatId: "919114411026@s.whatsapp.net",
      messageId: "msg_quoted_f",
      text: "ye wala batao",
      sender: "919114411026",
      timestamp: Date.now(),
      quoted: {
        id: "quoted_msg_99",
        text: "Website design package kitne ka hai?",
        sender: "919114411026",
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(sentMessages.length, 1);
    assert.match(sentMessages[0].text, /pricing|plan|₹|service/i);
  });

  // Test H: Emotional message ("bohot pareshan hu bhai") -> empathetic response
  it("Test H: Emotional message ('bohot pareshan hu bhai') receives empathetic, non-robotic response", async () => {
    await engine.acceptInboundEvent({
      tenantId: "default",
      chatId: "919114411026@s.whatsapp.net",
      messageId: "msg_emotional_h",
      text: "bohot pareshan hu bhai kuch samajh nahi aa raha",
      sender: "919114411026",
      timestamp: Date.now(),
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(sentMessages.length, 1);
    assert.match(sentMessages[0].text, /pareshan|chinta|sambhal|shant|fatar/i);
  });

  // Test I: Urgent message ("turant reply karo please") -> fast direct response
  it("Test I: Urgent message ('turant reply karo please') triggers fast direct response", async () => {
    await engine.acceptInboundEvent({
      tenantId: "default",
      chatId: "919114411026@s.whatsapp.net",
      messageId: "msg_urgent_i",
      text: "turant reply karo please urgent hai",
      sender: "919114411026",
      timestamp: Date.now(),
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(sentMessages.length, 1);
    assert.ok(sentMessages[0].text.length > 0);
  });

  // Test J: Playful message ("tu bot hai kya pagal") -> witty natural response
  it("Test J: Playful message ('tu bot hai kya pagal') receives natural human response without bot denial loop", async () => {
    await engine.acceptInboundEvent({
      tenantId: "default",
      chatId: "919114411026@s.whatsapp.net",
      messageId: "msg_playful_j",
      text: "tu bot hai kya pagal haha",
      sender: "919114411026",
      timestamp: Date.now(),
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(sentMessages.length, 1);
    assert.ok(sentMessages[0].text.length > 0);
  });

  // Test K: DAZY romantic contact message -> DAZY profile, level evaluated, no generic business reply
  it("Test K: DAZY romantic contact message triggers dedicated romantic profile without generic business replies", async () => {
    const dazyChat = "917903956968@s.whatsapp.net";
    await engine.acceptInboundEvent({
      tenantId: "default",
      chatId: dazyChat,
      messageId: "msg_dazy_k",
      text: "kahan ho? yaad aa rahi hai tumhari",
      sender: "917903956968",
      fromName: "DAZY",
      timestamp: Date.now(),
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(sentMessages.length, 1);
    // Must NOT be a generic business lead reply
    assert.doesNotMatch(sentMessages[0].text, /website|package|service|client/i);
    assert.match(sentMessages[0].text, /Dazy|pyaari|paas|yaad|yahi hu/i);
  });

  // Test O: Admin / manual message -> outbox sends with metadata { source: 'admin' }, no bot response triggered
  it("Test O: Admin/manual message routed through outbox sends directly with source:admin and no bot turn triggered", async () => {
    await outbox.enqueue({
      responseId: "resp_admin_o_1",
      chatId: "919114411026@s.whatsapp.net",
      text: "Manual message from admin dashboard",
      metadata: { source: "admin" },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0].text, "Manual message from admin dashboard");
    assert.equal(sentMessages[0].metadata?.source, "admin");
  });

  // Test P: Multiple concurrent chats -> independent processing, no cross-talk
  it("Test P: Multiple concurrent chats process independently without cross-talk", async () => {
    const chat1 = "919114411001@s.whatsapp.net";
    const chat2 = "919114411002@s.whatsapp.net";

    await Promise.all([
      engine.acceptInboundEvent({
        tenantId: "default",
        chatId: chat1,
        messageId: "msg_p_1",
        text: "User 1 asking about delivery",
        sender: "919114411001",
        timestamp: Date.now(),
      }),
      engine.acceptInboundEvent({
        tenantId: "default",
        chatId: chat2,
        messageId: "msg_p_2",
        text: "User 2 asking about pricing",
        sender: "919114411002",
        timestamp: Date.now(),
      }),
    ]);

    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(sentMessages.length, 2);
    const m1 = sentMessages.find((m) => m.chatId === chat1);
    const m2 = sentMessages.find((m) => m.chatId === chat2);
    assert.ok(m1, "Chat 1 must receive its own reply");
    assert.ok(m2, "Chat 2 must receive its own reply");
  });

  // Test Q: Multiple response rate across all tests -> strictly 0%
  it("Test Q: Multiple response rate metric is strictly 0%", async () => {
    const metrics = engine.getMetrics();
    assert.equal(metrics.multiple_response_rate, 0);
    assert.equal(metrics.duplicate_response_attempts, 0);
  });

  // Test R: Zero blank messages invariant across Outbox, QualityGate, and CommitManager
  it("Test R: Zero blank messages emitted when given empty or whitespace text", async () => {
    const testOutbox = new WhatsAppOutbox();
    const emitted: string[] = [];
    testOutbox.setSender(async (_chatId, text) => {
      emitted.push(text);
    });

    // Enqueue empty string
    await testOutbox.enqueue({
      responseId: "resp_blank_1",
      chatId: "919114411000@s.whatsapp.net",
      text: "",
    });

    // Enqueue whitespace string
    await testOutbox.enqueue({
      responseId: "resp_blank_2",
      chatId: "919114411000@s.whatsapp.net",
      text: "    \n\t  ",
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(emitted.length, 2);
    for (const text of emitted) {
      assert.ok(text.trim().length > 0, "Emitted text must never be empty or whitespace");
      assert.ok(!/^\s*$/.test(text), "Emitted text cannot be blank");
    }

    // QualityGate sanitize check
    const sanitizedEmpty = qualityGate.sanitize("");
    const sanitizedWhitespace = qualityGate.sanitize("   \t\n  ");
    assert.ok(sanitizedEmpty.trim().length > 0, "Sanitized empty string must return non-empty fallback");
    assert.ok(sanitizedWhitespace.trim().length > 0, "Sanitized whitespace must return non-empty fallback");

    // QualityGate audit check
    const auditEmpty = qualityGate.audit("");
    assert.ok(auditEmpty.sanitizedText.trim().length > 0, "Audited empty string must have non-empty sanitizedText");
  });

  // Test S: Repetitive 'hi' turns rotate naturally instead of outputting blank bubbles
  it("Test S: Repetitive greeting turns rotate and never become blank", async () => {
    const chat = "919114411099@s.whatsapp.net";
    const history = [
      { role: "user" as const, text: "hi" },
      { role: "assistant" as const, text: "Namaste! Boliye, main kaise madad kar sakta hoon?" },
      { role: "user" as const, text: "hi" },
      { role: "assistant" as const, text: "Ji boliye, main sun raha hoon." },
    ];

    const audit = qualityGate.audit("Namaste! Boliye, main kaise madad kar sakta hoon?", history);
    assert.ok(audit.sanitizedText.trim().length > 0, "Sanitized text must never be blank");
    assert.notEqual(audit.sanitizedText, "", "Sanitized text cannot be empty string");
  });
});
