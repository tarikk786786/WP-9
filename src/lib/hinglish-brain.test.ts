import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultRules } from "./default-rules.ts";
import { isLowQualityReply, writeHinglishReply } from "./hinglish-brain.ts";

describe("writeHinglishReply", () => {
  it("greets in soft Hinglish", () => {
    const text = writeHinglishReply("hi", "Amina", defaultRules, "greeting");
    assert.match(text, /Amina/);
    assert.match(text.toLowerCase(), /kaise ho|tarik/);
  });

  it("rejects hello loops", () => {
    assert.equal(isLowQualityReply("Hello, Hello! Hello, Hello! Hello, Hello!"), true);
  });

  it("points who-are-you to tarikislam.in", () => {
    const text = writeHinglishReply("who are you", "Amina", defaultRules);
    assert.match(text, /Tarik Islam/);
    assert.match(text, /tarikislam\.in/);
  });

  it("hires in first person, not on behalf", () => {
    const text = writeHinglishReply("I want to hire you", "Amina", defaultRules);
    assert.match(text.toLowerCase(), /\bmain\b/);
    assert.doesNotMatch(text, /on behalf/i);
    assert.doesNotMatch(text, /assistant/i);
  });

  it("answers hours without stiff english", () => {
    const text = writeHinglishReply("Hi, what are your hours?", "Amina", defaultRules, "hours");
    assert.doesNotMatch(text, /I usually reply between/);
    assert.match(text.toLowerCase(), /main |se |tak |beech/);
  });
});
