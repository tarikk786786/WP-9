import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { CallPolicyManager } from "../src/safety/policy.js";
import { CallConsentManager } from "../src/safety/consent.js";
import { IncomingCall } from "../src/types.js";

describe("Security, Privacy & Call Policy Guard", () => {
  const baseCall: IncomingCall = {
    callId: "call_sec_1",
    callerJid: "919999999999@s.whatsapp.net",
    callerPhone: "+919999999999",
    timestamp: Date.now(),
    isGroup: false,
  };

  test("CallPolicyManager rejects group calls by default", () => {
    const policy = new CallPolicyManager({ autoAnswerEnabled: true });
    const groupCall: IncomingCall = { ...baseCall, isGroup: true, callerJid: "12345-67890@g.us" };

    const res = policy.evaluateInboundCall(groupCall, 0);
    assert.equal(res.decision, "REJECT");
    assert.equal(res.reason, "group_calls_not_allowed");
  });

  test("CallPolicyManager rejects blocked contacts", () => {
    const policy = new CallPolicyManager({
      autoAnswerEnabled: true,
      blockedContacts: ["919999999999"],
    });

    const res = policy.evaluateInboundCall(baseCall, 0);
    assert.equal(res.decision, "REJECT");
    assert.equal(res.reason, "caller_in_blocklist");
  });

  test("CallPolicyManager rejects calls when autoAnswerEnabled is false", () => {
    const policy = new CallPolicyManager({ autoAnswerEnabled: false });

    const res = policy.evaluateInboundCall(baseCall, 0);
    assert.equal(res.decision, "REJECT");
    assert.equal(res.reason, "auto_answer_disabled");
  });

  test("CallConsentManager defaults to recording disabled and enforces AI disclosure", () => {
    const consent = new CallConsentManager("Namaste, main AI assistant hoon.");

    // Requirement 26: Call recording must be strictly disabled by default
    assert.equal(consent.isRecordingAllowed(), false);

    // Requirement 7: Transparent AI disclosure
    assert.ok(consent.getDisclosureText().includes("AI assistant"));
  });
});
