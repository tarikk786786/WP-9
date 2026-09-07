import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultRules } from "./default-rules.ts";
import { isCannedScript, isLowQualityReply, writeHinglishReply } from "./hinglish-brain.ts";

describe("writeHinglishReply", () => {
  it("greets like a person, not a bio", () => {
    const text = writeHinglishReply("hi", "Amina", defaultRules, "greeting");
    assert.match(text.toLowerCase(), /hey|haan|bolo|theek|ho raha/);
    assert.doesNotMatch(text, /forensics, AI, security/);
    assert.doesNotMatch(text, /tarikislam\.in/);
    assert.doesNotMatch(text, /Amina,/);
  });

  it("rejects hello loops and canned dumps", () => {
    assert.equal(isLowQualityReply("Hello, Hello! Hello, Hello! Hello, Hello!"), true);
    assert.equal(
      isCannedScript(
        "Message Tarik tak pahunch gaya. Extra detail ho to likh dena — public facts tarikislam.in pe hain, baaki main personally, calmly wapas aaunga. Hey, kaise ho? Main Tarik hoon — forensics, AI, security.",
      ),
      true,
    );
  });

  it("answers who-are-you without a brochure", () => {
    const text = writeHinglishReply("who are you", "Amina", defaultRules);
    assert.match(text.toLowerCase(), /tarik/);
    assert.doesNotMatch(text, /tarikislam\.in/);
    assert.doesNotMatch(text, /Forensic Scientist/);
  });

  it("hires in first person, not on behalf", () => {
    const text = writeHinglishReply("I want to hire you", "Amina", defaultRules);
    assert.match(text.toLowerCase(), /\b(main|haan|available|le sakta)\b/);
    assert.doesNotMatch(text, /on behalf/i);
    assert.doesNotMatch(text, /assistant/i);
  });

  it("answers hours without stiff english", () => {
    const text = writeHinglishReply("Hi, what are your hours?", "Amina", defaultRules, "hours");
    assert.doesNotMatch(text, /I usually reply between/);
    assert.match(text.toLowerCase(), /yahin|note|se /);
  });
});
