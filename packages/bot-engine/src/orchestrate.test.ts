import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeTurn } from "./orchestrate/intelligence.ts";
import { checkReplyQuality } from "./orchestrate/quality.ts";
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

  it("maps a price typo onto pricing intent", () => {
    const turn = analyzeTurn("pric pls", [], true);
    assert.match(turn.plan.intent, /pricing/);
  });

  it("rejects invented prices", () => {
    const analysis = analyzeMessage("kitna lagega website ka?");
    const check = checkReplyQuality("rate 45000 rs hai", analysis, ["rate andaz se nahi bolta"]);
    assert.equal(check.ok, false);
    assert.ok(check.reasons.includes("invented-price"));
  });

  it("joins a burst into one message", () => {
    assert.equal(combineBurstText(["hi", "bro", "you there"]), "hi\nbro\nyou there");
  });
});
