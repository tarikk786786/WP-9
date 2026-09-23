import test from "node:test";
import assert from "node:assert/strict";
import { SupervisorAgent } from "./supervisor.ts";
import { SalesAgent } from "./sales.ts";
import { SupportAgent } from "./support.ts";
import { BillingAgent } from "./billing.ts";
import { BookingAgent } from "./booking.ts";
import { GeneralAgent } from "./general.ts";
import { ToolRegistry } from "../tools/index.ts";
import type { AgentContext } from "./types.ts";

function createContext(text: string, overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    message: {
      id: "msg_test_1",
      whatsappMessageId: "wamid_1",
      sender: "919876543210@s.whatsapp.net",
      chatId: "919876543210@s.whatsapp.net",
      fromName: "Client User",
      type: "text",
      text,
      timestamp: new Date().toISOString(),
      isGroup: false,
      metadata: {},
    },
    history: [],
    intent: "unknown",
    tools: new ToolRegistry(),
    ...overrides,
  };
}

test("Multi-Agent System: SalesAgent handles pricing and service requirements", async () => {
  const sales = new SalesAgent();
  const ctx = createContext("website redesign karwana hai kitna price lagega?");
  
  assert.equal(sales.canHandle(ctx), true);
  const decision = await sales.execute(ctx);
  assert.equal(decision.action, "reply");
  assert.ok(decision.text?.includes("15k") || decision.text?.includes("depend"));
});

test("Multi-Agent System: SupportAgent triggers handoff on explicit human request", async () => {
  const support = new SupportAgent();
  const ctx = createContext("kisi human agent se baat karni hai urgent issue hai");

  assert.equal(support.canHandle(ctx), true);
  const decision = await support.execute(ctx);
  assert.equal(decision.action, "handoff");
  assert.equal(decision.confidence, 0.99);
  assert.ok(decision.text?.includes("transfer kar raha hoon"));
});

test("Multi-Agent System: BillingAgent requests proof for payment verification", async () => {
  const billing = new BillingAgent();
  const ctx = createContext("maine payment kar diya hai status verify karo");

  assert.equal(billing.canHandle(ctx), true);
  const decision = await billing.execute(ctx);
  assert.equal(decision.action, "reply");
  assert.ok(decision.text?.includes("transaction ID") || decision.text?.includes("screenshot"));
});

test("Multi-Agent System: BookingAgent provides afternoon call slots for tomorrow", async () => {
  const booking = new BookingAgent();
  const ctx = createContext("kal call pe baat ho sakti hai?");

  assert.equal(booking.canHandle(ctx), true);
  const decision = await booking.execute(ctx);
  assert.equal(decision.action, "reply");
  assert.ok(decision.text?.includes("Kal afternoon") || decision.text?.includes("slot"));
});

test("Multi-Agent System: GeneralAgent introduces Tarik with verified facts", async () => {
  const general = new GeneralAgent();
  const ctx = createContext("who are you?");

  const decision = await general.execute(ctx);
  assert.equal(decision.action, "reply");
  assert.ok(decision.text?.includes("Tarik Islam"));
  assert.ok(decision.text?.includes("DEZO Studio"));
});

test("Multi-Agent System: SupervisorAgent routes complex inquiries to the correct specialist", async () => {
  const supervisor = new SupervisorAgent();

  // Test sales routing
  const salesCtx = createContext("mujhe ecommerce application develop karwani hai");
  const salesDecision = await supervisor.orchestrate(salesCtx);
  assert.equal(salesDecision.targetAgent, "sales");

  // Test support routing
  const supportCtx = createContext("login page crash ho raha hai bug aa raha hai");
  const supportDecision = await supervisor.orchestrate(supportCtx);
  assert.equal(supportDecision.targetAgent, "support");

  // Test billing routing
  const billingCtx = createContext("invoice aur GST receipt bhej do");
  const billingDecision = await supervisor.orchestrate(billingCtx);
  assert.equal(billingDecision.targetAgent, "billing");

  // Test booking routing
  const bookingCtx = createContext("kal Google meet pe connect ho sakte hain?");
  const bookingDecision = await supervisor.orchestrate(bookingCtx);
  assert.equal(bookingDecision.targetAgent, "booking");

  // Test handoff escalation
  const handoffCtx = createContext("talk to real agent please");
  const handoffDecision = await supervisor.orchestrate(handoffCtx);
  assert.equal(handoffDecision.action, "handoff");
});
