import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultRules } from "./default-rules.ts";
import { writeHinglishReply } from "./hinglish-brain.ts";

describe("writeHinglishReply", () => {
  it("greets in soft Hinglish", () => {
    const text = writeHinglishReply("hi", "Amina", defaultRules, "greeting");
    assert.match(text, /Amina/);
    assert.match(text.toLowerCase(), /kaise ho|yahin/);
  });

  it("answers hours without stiff english", () => {
    const text = writeHinglishReply("Hi, what are your hours?", "Amina", defaultRules, "hours");
    assert.doesNotMatch(text, /I usually reply between/);
    assert.match(text.toLowerCase(), /main |se |tak |beech/);
  });
});
