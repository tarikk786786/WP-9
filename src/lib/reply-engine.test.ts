import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultRules } from "./default-rules.ts";
import { parseRules } from "./rules.ts";
import { decideReply } from "./reply-engine.ts";

describe("parseRules", () => {
  it("rewrites leftover third-person greetings as Tarik", () => {
    const parsed = parseRules({
      ...defaultRules,
      greetingReply: "Hey, kaise ho? Tarik yahan hai — forensics.",
    });
    assert.ok(parsed);
    assert.equal(parsed?.greetingReply, defaultRules.greetingReply);
    assert.match(parsed?.greetingReply ?? "", /kya ho raha|bolo|hey/);
  });
});

describe("decideReply", () => {
  it("skips when the bot is off", () => {
    const decision = decideReply("hello", "Sam", { ...defaultRules, enabled: false });
    assert.equal(decision.action, "skip");
  });

  it("prefers the longer keyword when both hi and hours match", () => {
    const decision = decideReply("Hi, what are your hours?", "Sam", defaultRules);
    assert.equal(decision.action, "reply");
    if (decision.action === "reply") {
      assert.equal(decision.matchedRule, "hours");
    }
  });

  it("does not treat hi as a match inside hours", () => {
    const decision = decideReply("What are your hours?", "Sam", defaultRules);
    assert.equal(decision.action, "reply");
    if (decision.action === "reply") {
      assert.equal(decision.matchedRule, "hours");
    }
  });

  it("treats a plain hi as Tarik’s greeting", () => {
    const decision = decideReply("hi", "Amina", defaultRules);
    assert.equal(decision.action, "reply");
    if (decision.action === "reply") {
      assert.equal(decision.matchedRule, "greeting");
      assert.match(decision.text.toLowerCase(), /hey|haan|bolo|ho raha/);
    }
  });

  it("treats assalamualaikum as a greeting", () => {
    const decision = decideReply("Assalamualaikum", "Amina", defaultRules);
    assert.equal(decision.action, "reply");
    if (decision.action === "reply") {
      assert.equal(decision.matchedRule, "greeting");
    }
  });

  it("matches a keyword before the default reply", () => {
    const decision = decideReply("What is the price?", "Sam", defaultRules);
    assert.equal(decision.action, "reply");
    if (decision.action === "reply") {
      assert.equal(decision.matchedRule, "price");
    }
  });

  it("uses after-hours copy outside the window", () => {
    const rules = {
      ...defaultRules,
      businessHoursEnabled: true,
      timezone: "UTC",
      openHour: 9,
      closeHour: 18,
    };
    const decision = decideReply("hello", "Sam", rules, new Date("2026-09-07T21:00:00Z"));
    assert.equal(decision.action, "reply");
    if (decision.action === "reply") {
      assert.equal(decision.matchedRule, "after-hours");
    }
  });
});
