import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeTurn } from "./orchestrate/intelligence.ts";
import { checkReplyQuality } from "./orchestrate/quality.ts";
import { polishHumanReply } from "./orchestrate/polish.ts";
import { combineBurstText } from "./orchestrate/debounce.ts";
import { analyzeMessage } from "./ai/analyze.ts";

describe("conversation intelligence", () => {
  it("acknowledges a thanks without needing a model", () => {
    const turn = analyzeTurn("thanks bro", [], false);
    assert.equal(turn.plan.action, "acknowledge");
    assert.ok(turn.plan.draft);
  });

  it("clarifies a dangling follow-up using thread context", () => {
    const turn = analyzeTurn("tomorrow?", [{ role: "user", text: "can you send the brief today?" }], false);
    assert.equal(turn.plan.action, "clarify");
    assert.match(turn.plan.draft ?? "", /baat/i);
  });

  it("reads a messy multi-ask the way a person would", () => {
    const turn = analyzeTurn(
      "hey tarik, dezo se webiste banana hai. process kya hai, price kaise decide hota hai, aur site kahan dekhun?",
      [],
      true,
    );
    assert.ok(turn.analysis.asks.length >= 3);
    assert.match(turn.analysis.meaning, /rate|process|site|dezo/i);
    assert.equal(turn.plan.action, "answer");
    assert.equal(turn.analysis.preferredStyle, "complete");
  });

  it("maps a price typo onto pricing intent", () => {
    const turn = analyzeTurn("pric pls", [], true);
    assert.match(turn.plan.intent, /pricing/);
  });

  it("does not ignore a price ask hidden in typos", () => {
    const turn = analyzeTurn("pric pls webiste banana hai", [], true);
    assert.ok(turn.analysis.intents.includes("pricing"));
    assert.ok(turn.analysis.intents.includes("project"));
    assert.notEqual(turn.plan.action, "ask");
  });

  it("rejects invented prices", () => {
    const analysis = analyzeMessage("kitna lagega website ka?");
    const check = checkReplyQuality("rate 45000 rs hai", analysis, ["rate andaz se nahi bolta"]);
    assert.equal(check.ok, false);
    assert.ok(check.reasons.includes("invented-price"));
  });

  it("rejects boastful copy", () => {
    const analysis = analyzeMessage("can you do security?");
    const check = checkReplyQuality("I am the best, audits are my thing, guaranteed.", analysis, []);
    assert.equal(check.ok, false);
  });

  it("rejects lead-desk and on-behalf copy", () => {
    const analysis = analyzeMessage("website banana hai");
    const lead = checkReplyQuality("send 3 lines: kya banana hai, kis ke liye, kab tak. brief chahiye.", analysis, []);
    const behalf = checkReplyQuality("I am writing on behalf of Tarik. Thanks for reaching out.", analysis, []);
    assert.equal(lead.ok, false);
    assert.equal(behalf.ok, false);
  });

  it("keeps a short hire ask as a person, not a quote form", () => {
    const turn = analyzeTurn("I want to hire you for a website", [], true);
    assert.equal(turn.plan.action, "ask");
    assert.match(turn.plan.draft ?? "", /bata kya soch/i);
    assert.doesNotMatch(turn.plan.draft ?? "", /3 lines|rate scope|brief/i);
  });

  it("answers are-you-a-bot as Tarik, without naming AI", () => {
    const turn = analyzeTurn("are you a bot?", [], true);
    assert.equal(turn.plan.action, "acknowledge");
    assert.match(turn.plan.draft ?? "", /main hi hoon/i);
    assert.doesNotMatch(turn.plan.draft ?? "", /\b(ai|bot|chatgpt|auto)\b/i);
    const check = checkReplyQuality("I am an AI assistant, not Tarik.", analyzeMessage("are you a bot?"), []);
    assert.equal(check.ok, false);
  });

  it("acks a bare ok without asking a new question", () => {
    const turn = analyzeTurn("ok", [{ role: "user", text: "brief bhej dena" }], false);
    assert.equal(turn.plan.action, "acknowledge");
    assert.equal(turn.plan.draft, "ok");
  });

  it("asks what tomorrow is about instead of agreeing blindly", () => {
    const turn = analyzeTurn("kal?", [], true);
    assert.equal(turn.plan.action, "clarify");
    assert.match(turn.plan.draft ?? "", /kal/i);
  });

  it("joins a burst into one message", () => {
    assert.equal(combineBurstText(["hi", "bro", "you there"]), "hi\nbro\nyou there");
  });

  it("strips a second greeting and leftover sales english", () => {
    const analysis = analyzeMessage("hey, process kya hai aur rate?");
    const text = polishHumanReply(
      "hey, bolo\nprocess simple hai\nWe can definitely talk.\nrate scope pe depend karta hai?",
      "hey, process kya hai aur rate?",
      analysis,
    );
    assert.doesNotMatch(text, /hey, bolo/i);
    assert.doesNotMatch(text, /definitely/i);
  });
});
