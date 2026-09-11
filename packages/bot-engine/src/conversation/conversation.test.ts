import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { EventGate } from "./event-gate/index.ts";
import { ConversationTurnBuilder } from "./turn-builder/index.ts";
import { UnderstandingEngine } from "./understanding/index.ts";
import { ResponsePlanner, QualityGate, ResponseCommitManager } from "./response/index.ts";
import { IdempotentOutbox } from "./outbox/index.ts";
import { AuthoritativeConversationEngine } from "./engine.ts";

describe("Authoritative Conversation Engine — PRD V2.0 Regression Suite", () => {
  let eventGate: EventGate;
  let turnBuilder: ConversationTurnBuilder;
  let understandingEngine: UnderstandingEngine;
  let responsePlanner: ResponsePlanner;
  let qualityGate: QualityGate;
  let responseCommit: ResponseCommitManager;
  let outbox: IdempotentOutbox;
  let engine: AuthoritativeConversationEngine;
  let sentMessages: Array<{ chatId: string; text: string; metadata?: Record<string, unknown> }>;

  beforeEach(() => {
    eventGate = new EventGate();
    turnBuilder = new ConversationTurnBuilder({ defaultDebounceMs: 20, incompleteDebounceMs: 40 });
    understandingEngine = new UnderstandingEngine();
    responsePlanner = new ResponsePlanner();
    qualityGate = new QualityGate();
    responseCommit = new ResponseCommitManager();
    outbox = new IdempotentOutbox();
    sentMessages = [];

    outbox.setSender(async (chatId, text, metadata) => {
      sentMessages.push({ chatId, text, metadata });
    });

    engine = new AuthoritativeConversationEngine({
      eventGate,
      turnBuilder,
      understandingEngine,
      responsePlanner,
      qualityGate,
      responseCommit,
      outbox,
      getSettings: async () => ({ enabled: true, aiEnabled: true }),
      getConversationStatus: async () => "bot",
      getHistory: async () => [],
    });
  });

  // Test 1 (PRD 42): Duplicate Test
  it("Test 1 (PRD 42): Same message event sent 10 times results in exactly 1 response", async () => {
    const event = {
      tenantId: "default",
      chatId: "919114411026@s.whatsapp.net",
      messageId: "msg_dup_123",
      text: "Hello, kya haal hai?",
      sender: "919114411026",
      timestamp: Date.now(),
    };

    let acceptedCount = 0;
    for (let i = 0; i < 10; i++) {
      const res = engine.acceptInboundEvent(event);
      if (res.accepted) acceptedCount++;
    }

    // Only the very first event must be accepted by EventGate
    assert.equal(acceptedCount, 1, "Exactly 1 inbound event accepted out of 10 identical submissions");

    // Flush the TurnBuilder
    await turnBuilder.flush("default:919114411026@s.whatsapp.net");
    await outbox.processQueue();

    // Exactly 1 outbound message sent
    assert.equal(sentMessages.length, 1, "Exactly 1 outbound message sent");
  });

  // Test 2 (PRD 43): Burst Test
  it("Test 2 (PRD 43): Rapid fragments are aggregated into exactly 1 combined response", async () => {
    const chatId = "919114411026@s.whatsapp.net";
    const fragments = [
      { id: "f1", text: "bhai" },
      { id: "f2", text: "ek baat" },
      { id: "f3", text: "kal jo hua" },
      { id: "f4", text: "uska kya karu?" },
    ];

    for (const f of fragments) {
      engine.acceptInboundEvent({
        tenantId: "default",
        chatId,
        messageId: f.id,
        text: f.text,
        sender: "919114411026",
        timestamp: Date.now(),
      });
    }

    // Flush the aggregated burst turn
    const turn = await turnBuilder.flush(`default:${chatId}`);
    assert.ok(turn, "Turn was constructed");
    assert.equal(turn.fragments.length, 4, "All 4 fragments combined into single turn");
    assert.ok(turn.combinedText.includes("kal jo hua"), "Contains body of thoughts");

    await outbox.processQueue();
    assert.equal(sentMessages.length, 1, "Exactly 1 reply sent for all 4 burst fragments");
  });

  // Test 3 (PRD 44): Context & Pronoun Resolution Test
  it("Test 3 (PRD 44): Resolves 'uska' pronoun from conversation history", async () => {
    const history = [
      { role: "user" as const, text: "Plans kya hain?" },
      { role: "assistant" as const, text: "Humare paas Premium Plan ₹999 aur Starter Plan ₹499 hai." },
    ];

    const understanding = understandingEngine.analyze({
      rawText: "uska cheaper option kya hai?",
      history,
    });

    assert.ok(understanding.resolvedPronouns.length > 0, "Resolved anaphoric pronoun");
    assert.equal(understanding.resolvedPronouns[0].pronoun, "uska");
    assert.ok(
      understanding.resolvedPronouns[0].refersTo.toLowerCase().includes("premium") ||
      understanding.resolvedPronouns[0].refersTo.toLowerCase().includes("plan"),
      "Refers to the discussed plan"
    );
  });

  // Test 4 (PRD 45): Repair Test
  it("Test 4 (PRD 45): Detects conversational repair and corrects misunderstanding", async () => {
    const understanding = understandingEngine.analyze({
      rawText: "price nahi pucha tha, kab miloge yeh batao",
    });

    assert.equal(understanding.isRepair, true, "isRepair flagged as true");
    assert.equal(understanding.repairDetails?.rejectedInterpretation, "pricing");

    const plan = responsePlanner.plan(understanding, {});
    assert.equal(plan.action, "repair_acknowledgment", "Planned repair acknowledgment action");
  });

  // Test 5 (PRD 46): Emotion & Social Tone Test
  it("Test 5 (PRD 46): Detects emotional venting and plans empathetic, non-robotic reply", async () => {
    const understanding = understandingEngine.analyze({
      rawText: "yaar sab kharab ho gaya 😭",
    });

    assert.equal(understanding.emotion, "frustrated", "Emotion detected as frustrated");
    assert.equal(understanding.socialTone, "venting", "Social tone detected as venting");

    const plan = responsePlanner.plan(understanding, {});
    assert.equal(plan.action, "empathy_and_support", "Empathy plan selected");

    // Quality gate should verify no robotic tone
    const quality = qualityGate.sanitize(
      "As an AI language model, I apologize for any inconvenience caused. Arre yaar, sab theek ho jayega."
    );
    assert.ok(!quality.sanitizedText.toLowerCase().includes("as an ai"), "Robotic AI disclaimer stripped");
  });

  // Test 6 (PRD 47): Ambiguity & Clarification Test
  it("Test 6 (PRD 47): Generates 1 concise clarification question when request is ambiguous", async () => {
    const understanding = understandingEngine.analyze({
      rawText: "premium ka price aur options konsa hai?",
    });

    const plan = responsePlanner.plan(understanding, { hasMultipleOptions: true });
    assert.equal(plan.action, "clarification", "Clarification action selected");
  });

  // Test 7 (PRD 48): Live Data / Tool Grounding Test
  it("Test 7 (PRD 48): Executes weather tool for live queries and avoids hallucinations", async () => {
    let toolExecuted = false;
    engine.updateDependencies({
      executeTool: async (toolName, args) => {
        if (toolName === "weather") {
          toolExecuted = true;
          return "Kal Mumbai mein halki baarish ho sakti hai (28°C).";
        }
        return null;
      },
    });

    engine.acceptInboundEvent({
      tenantId: "default",
      chatId: "919876543210@s.whatsapp.net",
      messageId: "tool_msg_1",
      text: "kal baarish hogi kya?",
      sender: "919876543210",
      timestamp: Date.now(),
    });

    await turnBuilder.flush("default:919876543210@s.whatsapp.net");
    await outbox.processQueue();

    assert.equal(toolExecuted, true, "Weather tool was called");
    assert.equal(sentMessages.length, 1);
    assert.ok(sentMessages[0].text.includes("baarish"), "Output grounded in tool response");
  });

  // Test 8 (PRD 50): Outbox Retry & Deduplication Test
  it("Test 8 (PRD 50): Outbox retries with identical responseId and prevents duplicate sends", async () => {
    let attempt = 0;
    const testOutbox = new IdempotentOutbox();
    const successfulSends: string[] = [];

    testOutbox.setSender(async (_chatId, text) => {
      attempt++;
      if (attempt === 1) {
        throw new Error("Temporary network timeout");
      }
      successfulSends.push(text);
    });

    // Enqueue
    const { isDuplicate } = testOutbox.enqueue({
      tenantId: "t1",
      chatId: "c1",
      responseId: "resp_fixed_123",
      text: "Order status is confirmed.",
    });
    assert.equal(isDuplicate, false);

    // First attempt fails
    await testOutbox.processQueue();
    assert.equal(successfulSends.length, 0);
    const itemAfterFail = testOutbox.getItem("t1", "c1", "resp_fixed_123");
    assert.equal(itemAfterFail?.status, "FAILED");

    // Retry attempt with same responseId
    const retryEnqueue = testOutbox.enqueue({
      tenantId: "t1",
      chatId: "c1",
      responseId: "resp_fixed_123",
      text: "Order status is confirmed.",
    });
    assert.equal(retryEnqueue.isDuplicate, true, "Recognized as duplicate retry of same responseId");

    // Queue process succeeds
    await testOutbox.processQueue();
    assert.equal(successfulSends.length, 1, "Exactly 1 successful delivery after retry");
    assert.equal(testOutbox.getItem("t1", "c1", "resp_fixed_123")?.status, "SENT");
  });

  // Test 9 (PRD 36): Bot Disabled Test
  it("Test 9 (PRD 36): When settings.enabled = false, exactly 0 responses are produced", async () => {
    engine.updateDependencies({
      getSettings: async () => ({ enabled: false }),
    });

    engine.acceptInboundEvent({
      tenantId: "default",
      chatId: "919000000001@s.whatsapp.net",
      messageId: "disabled_msg_1",
      text: "Hello please help me",
      sender: "919000000001",
      timestamp: Date.now(),
    });

    await turnBuilder.flush("default:919000000001@s.whatsapp.net");
    await outbox.processQueue();

    assert.equal(sentMessages.length, 0, "Zero responses produced when bot is disabled");
  });

  // Test 10 (PRD 37): Human Handoff Test
  it("Test 10 (PRD 37): When conversation status is waiting_human, bot produces 0 responses", async () => {
    engine.updateDependencies({
      getConversationStatus: async () => "waiting_human",
    });

    engine.acceptInboundEvent({
      tenantId: "default",
      chatId: "919000000002@s.whatsapp.net",
      messageId: "human_msg_1",
      text: "Kya rate chal raha hai?",
      sender: "919000000002",
      timestamp: Date.now(),
    });

    await turnBuilder.flush("default:919000000002@s.whatsapp.net");
    await outbox.processQueue();

    assert.equal(sentMessages.length, 0, "Zero responses produced when conversation is waiting_human");
  });
});
