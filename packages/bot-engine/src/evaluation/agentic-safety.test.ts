import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { permissionChecker } from "../authorization/permission-check.ts";
import { policyEngine } from "../authorization/policy-engine.ts";
import { createChatResource, createAdminResource, createMemoryResource } from "../authorization/resource-scope.ts";

import { contactResolver } from "../identity/contact-resolver.ts";
import { normalizePhoneNumber } from "../identity/phone-normalizer.ts";
import { parseJid } from "../identity/jid-resolver.ts";

import { actionPlanner } from "../actions/action-planner.ts";
import { confirmationEngine } from "../actions/confirmation.ts";
import { actionExecutor } from "../actions/action-executor.ts";

import { browserDomainPolicy } from "../browser/domain-policy.ts";
import { redactLogData } from "../logging/structured-logger.ts";

import { questionDecisionEngine } from "../operational-intelligence/question-decision.ts";
import { conversationFatigueEngine } from "../operational-intelligence/fatigue-engine.ts";
import { openLoopEngine } from "../operational-intelligence/open-loops.ts";

describe("WP-9 Master Evaluation Suite: Agentic Action Safety & Operational Intelligence", () => {
  it("Relationship permission check (OpenFGA): customer cannot execute admin actions", () => {
    const customerSubject = {
      id: "cust_123",
      role: "customer" as const,
      chatId: "919876543210@s.whatsapp.net",
    };

    const adminResource = createAdminResource();

    const decision = permissionChecker.check({
      subject: customerSubject,
      action: "delete_conversation",
      resource: adminResource,
    });

    assert.equal(decision.allowed, false, "Customer must be denied delete_conversation action");
  });

  it("Relationship permission check: DAZY is authorized for romantic contact memory", () => {
    const dazySubject = {
      id: "dazy",
      role: "special_contact" as const,
      isDazy: true,
      chatId: "917903956968@s.whatsapp.net",
    };

    const privateMemory = createMemoryResource("dazy_memory", true);

    const decision = permissionChecker.check({
      subject: dazySubject,
      action: "access_private_memory",
      resource: privateMemory,
    });

    assert.equal(decision.allowed, true, "DAZY must have access to private contact memory");
  });

  it("Policy Engine (OPA): enforces human handoff and confirmation requirements", () => {
    const agentSubject = {
      id: "agent_brain",
      role: "ai_agent" as const,
      chatId: "919876543210@s.whatsapp.net",
    };

    const chatResource = createChatResource("919876543210@s.whatsapp.net");

    // 1. Human handoff active
    const handoffDecision = policyEngine.evaluate(
      {
        subject: agentSubject,
        action: "send_message",
        resource: chatResource,
      },
      {
        botEnabled: true,
        conversationStatus: "human", // Human representative took over
      },
    );
    assert.equal(handoffDecision.allowed, false);
    assert.equal(handoffDecision.ruleMatched, "human_handoff_policy");

    // 2. Sensitive action requires confirmation
    const docDecision = policyEngine.evaluate(
      {
        subject: agentSubject,
        action: "send_document",
        resource: chatResource,
      },
      {
        botEnabled: true,
        conversationStatus: "bot",
        confirmed: false, // User has not confirmed
      },
    );
    assert.equal(docDecision.allowed, false);
    assert.equal(docDecision.requiresConfirmation, true);
  });

  it("Contact identity resolution: normalizes Indian numbers and builds rich ContactIdentity", () => {
    assert.equal(normalizePhoneNumber("07903956968"), "917903956968");
    assert.equal(normalizePhoneNumber("+91 91144 11026"), "919114411026");

    const parsed = parseJid("232839253623024@lid");
    assert.equal(parsed.type, "user_lid");
    assert.equal(parsed.lid, "232839253623024");

    // Resolve DAZY contact
    const identity = contactResolver.resolve({
      jid: "917903956968@s.whatsapp.net",
      fromName: "Dazy",
    });

    assert.equal(identity.isDazy, true);
    assert.equal(identity.relationship, "romantic_partner");
    assert.equal(identity.profile.warmth, 100);
  });

  it("Action planner & two-phase confirmation: plans actions and tracks confirmation", async () => {
    const plan = actionPlanner.planAction("Usko ye file bhej do");
    assert.equal(plan.verb, "SEND");
    assert.equal(plan.requiresConfirmation, true);

    const chatId = "test_chat_confirm";
    confirmationEngine.registerPending(chatId, plan);

    // User confirms with "haan bhej do"
    const evalRes = confirmationEngine.evaluateConfirmationReply(chatId, "haan bhej do");
    assert.equal(evalRes.isConfirmed, true);

    const execResult = await actionExecutor.execute(plan, true);
    assert.equal(execResult.success, true);
  });

  it("Browser domain policy: blocks SSRF and metadata IP addresses", () => {
    assert.equal(browserDomainPolicy.isAllowed("http://127.0.0.1/admin").allowed, false);
    assert.equal(browserDomainPolicy.isAllowed("http://169.254.169.254/latest/meta-data").allowed, false);
    assert.equal(browserDomainPolicy.isAllowed("https://tarikislam.in").allowed, true);
  });

  it("Structured logger: automatically redacts secrets and credentials", () => {
    const rawLog = "Connecting with token sk-abc123456789 and api_key='gsk_xyz987'";
    const redacted = redactLogData(rawLog);
    assert.doesNotMatch(redacted, /sk-abc123456789/);
    assert.doesNotMatch(redacted, /gsk_xyz987/);
    assert.match(redacted, /\[REDACTED\]/);
  });

  it("Operational intelligence: tracks open loops, handles fatigue, and clarifies questions", () => {
    // Open loops
    const loop = openLoopEngine.createLoop({
      chatId: "chat_loop_1",
      description: "Lookup pricing for client",
    });
    assert.equal(loop.state, "OPEN");
    const active = openLoopEngine.getActiveLoops("chat_loop_1");
    assert.equal(active.length, 1);

    // Question decision engine: clarifies bare "kal?" when context is missing
    const decision = questionDecisionEngine.evaluate("kal?");
    assert.equal(decision.decision, "ASK_CLARIFICATION");

    // Fatigue engine: lowers initiative after repeated passive affirmations
    conversationFatigueEngine.evaluateFatigue("chat_fatigue", "ok");
    conversationFatigueEngine.evaluateFatigue("chat_fatigue", "haan");
    const fatigueResult = conversationFatigueEngine.evaluateFatigue("chat_fatigue", "hmm");
    assert.equal(fatigueResult.isFatigued, true);
    assert.match(fatigueResult.suggestedReply || "", /theek hai/i);
  });
});
