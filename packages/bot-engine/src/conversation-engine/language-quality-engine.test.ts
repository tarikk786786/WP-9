import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  humanLanguageQualityEngine,
  LanguageNormalizer,
  SpellingChecker,
  GrammarChecker,
  HumilityChecker,
  ToneChecker,
  ContextChecker,
  NaturalnessChecker,
} from "./language-quality-engine.ts";
import { qualityGate } from "./quality-gate.ts";

describe("WP-9 Human Language Quality Engine", () => {
  const normalizer = new LanguageNormalizer();
  const spellingChecker = new SpellingChecker();
  const grammarChecker = new GrammarChecker();
  const humilityChecker = new HumilityChecker();
  const toneChecker = new ToneChecker();
  const contextChecker = new ContextChecker();
  const naturalnessChecker = new NaturalnessChecker();

  // 1. Spelling & Typo Correction
  it("Stage 1 & 2: Corrects accidental typos and duplicate words without over-correcting WhatsApp slang", () => {
    const input = "The service is definately availble tommorow. We will recieve the the payment soon.";
    const res = spellingChecker.checkAndRepair(input);
    assert.match(res.text, /definitely available tomorrow/i);
    assert.match(res.text, /receive the payment/i);
    assert.doesNotMatch(res.text, /the the/);

    // Safeguard: WhatsApp natural words must NOT be corrupted
    const whatsappText = "haan haan bilkul acha hai, thik hai bhai";
    const waRes = spellingChecker.checkAndRepair(whatsappText);
    assert.equal(waRes.text, "haan haan bilkul acha hai, thik hai bhai");

    // Collapses 3+ repetitions to natural double emphasis
    const excessRepeat = "haan haan haan haan bhai";
    const repeatRes = spellingChecker.checkAndRepair(excessRepeat);
    assert.equal(repeatRes.text, "haan haan bhai");
  });

  // 2. Hinglish Normalization without formal textbook conversion
  it("Stage 1: Normalizes Hinglish shorthand but keeps output natural and never turns into formal English", () => {
    const input = "pls ye kr do aur btao kya status h";
    const res = normalizer.normalize(input);
    assert.match(res.text, /please ye kar do aur batao/i);
    // Invariant: Never turns "haan bhai" into "Yes, brother"
    const hinglishInput = "haan bhai";
    const hinglishRes = normalizer.normalize(hinglishInput);
    assert.equal(hinglishRes.text, "haan bhai");
    assert.doesNotMatch(hinglishRes.text, /yes, brother/i);
  });

  // 3. Grammar Checker
  it("Stage 3: Simplifies bureaucratic textbook phrasing into simple natural sentences and fixes punctuation", () => {
    const bureaucratic = "In accordance with the information presently available, I can confirm that service is active ,and ready.";
    const res = grammarChecker.checkAndRepair(bureaucratic);
    assert.doesNotMatch(res.text, /In accordance with the information presently available/i);
    assert.match(res.text, /active, and ready/);
  });

  // 4. Humility Engine & Anti-Arrogance
  it("Stage 4: Eliminates superior, arrogant, and condescending statements with humble alternatives", () => {
    const arrogant = "Obviously, anyone knows that. As I already told you, you don't understand the policy.";
    const res = humilityChecker.checkAndRepair(arrogant);
    assert.doesNotMatch(res.text, /obviously/i);
    assert.doesNotMatch(res.text, /as i already told you/i);
    assert.doesNotMatch(res.text, /you don't understand/i);
    assert.match(res.text, /haan, samjha/i);
    assert.match(res.text, /jaisa pehle baat hui thi/i);
    assert.match(res.text, /explain nahi kar paya/i);
    assert.ok(res.score >= 90, `Humility score must be >= 90, got ${res.score}`);
  });

  // 5. Never Blame User
  it("Stage 4: Never blames the user for confusion or unclear inquiries", () => {
    const blaming = "You didn't explain properly. Your question is unclear.";
    const res = humilityChecker.checkAndRepair(blaming);
    assert.doesNotMatch(res.text, /you didn't explain properly/i);
    assert.doesNotMatch(res.text, /your question is unclear/i);
    assert.match(res.text, /shayad main tumhari baat sahi samajh nahi paya/i);
    assert.match(res.text, /chhota sa clarification chahiye/i);
  });

  // 6. Corporate Robotic Opening Removal
  it("Stage 4: Strips corporate robotic openings (Certainly! Absolutely! Sure!)", () => {
    const robotic = "Certainly! I would be happy to assist you with the pricing. ₹500 per month hai.";
    const res = humilityChecker.checkAndRepair(robotic);
    assert.doesNotMatch(res.text, /certainly! i would be happy to assist/i);
    assert.match(res.text, /₹500 per month hai/);
  });

  // 7. Tone & De-escalation for Frustrated/Angry Users
  it("Stage 5: Non-defensive and humble acknowledgment when user is frustrated or angry", () => {
    const defensive = "That was not my fault. You are being unreasonable.";
    const res = toneChecker.checkAndRepair(defensive, {
      emotionState: { primary: "angry", intensity: "high", confidence: 0.9, evidence: [] },
    });
    assert.doesNotMatch(res.text, /that was not my fault/i);
    assert.doesNotMatch(res.text, /you are being unreasonable/i);
    assert.match(res.text, /meri taraf se confusion hua tha/i);
    assert.match(res.text, /samajh gaya ki ye irritating hai/i);
  });

  // 8. DAZY Romantic Humility
  it("Stage 5: Enforces gentle romantic humility for DAZY and removes arrogant/possessive phrasing", () => {
    const dazyArrogant = "Obviously tum mujhe miss karogi. tumhe mere bina rehna mushkil hai.";
    const res = toneChecker.checkAndRepair(dazyArrogant, { isDazy: true });
    assert.doesNotMatch(res.text, /obviously tum mujhe miss karogi/i);
    assert.doesNotMatch(res.text, /tumhe mere bina rehna mushkil hai/i);
    assert.match(res.text, /shayad thoda sa miss kiya hoga 😌❤️/);
    assert.match(res.text, /smile zaroor aa jaati hai ❤️/);
  });

  // 9. Naturalness Checker & Canned Closing Stripping
  it("Stage 7: Strips artificial corporate closings and computes naturalness score >= 85", () => {
    const canned = "Kal 10 baje milte hain. Is there anything else I can assist you with? Feel free to reach out if you have any questions.";
    const res = naturalnessChecker.checkAndRepair(canned);
    assert.doesNotMatch(res.text, /is there anything else i can assist you with/i);
    assert.doesNotMatch(res.text, /feel free to reach out/i);
    assert.equal(res.text, "Kal 10 baje milte hain.");
    assert.ok(res.score >= 85, `Naturalness score must be >= 85, got ${res.score}`);
  });

  // 10. End-to-End Pipeline Execution & Pre-Commit Checklist
  it("Stage 8: End-to-end HumanLanguageQualityEngine validates checklist and passes all metrics", () => {
    const rawLlmOutput =
      "Certainly! I'd be happy to help. As I already told you, the service is definately availble tommorow. Let me know if you need anything else.";

    const history = [
      { role: "user" as const, text: "kya kal service available hai?", timestamp: Date.now() - 10000 },
    ];

    const result = humanLanguageQualityEngine.process(rawLlmOutput, history, {
      userLanguage: "hinglish",
    });

    assert.equal(result.passed, true);
    assert.doesNotMatch(result.sanitizedText, /certainly!/i);
    assert.doesNotMatch(result.sanitizedText, /as i already told you/i);
    assert.doesNotMatch(result.sanitizedText, /definately|availble|tommorow/i);
    assert.doesNotMatch(result.sanitizedText, /let me know if you need anything else/i);
    assert.match(result.sanitizedText, /definitely available tomorrow/i);

    // Verify scores meet production minimums
    assert.ok(result.scores.humility >= 90, `Humility score ${result.scores.humility} >= 90`);
    assert.ok(result.scores.naturalness >= 85, `Naturalness score ${result.scores.naturalness} >= 85`);

    // Verify full checklist PASS
    assert.equal(result.checklist.spelling, "PASS");
    assert.equal(result.checklist.grammar, "PASS");
    assert.equal(result.checklist.humility, "PASS");
    assert.equal(result.checklist.emotion, "PASS");
    assert.equal(result.checklist.context, "PASS");
    assert.equal(result.checklist.naturalness, "PASS");
    assert.equal(result.checklist.noHallucination, "PASS");
    assert.equal(result.checklist.noDuplicate, "PASS");
    assert.equal(result.checklist.oneResponse, "PASS");
  });

  // 11. QualityGate integration maintains backward compatibility
  it("ResponseQualityGate seamlessly uses HumanLanguageQualityEngine", () => {
    const audit = qualityGate.audit("Certainly! Your order is recieved and definately confirmed.", []);
    assert.equal(audit.passed, true);
    assert.doesNotMatch(audit.sanitizedText, /certainly!/i);
    assert.match(audit.sanitizedText, /received and definitely confirmed/i);
    assert.ok(audit.scores && audit.scores.humility >= 90);
    assert.ok(audit.scores && audit.scores.naturalness >= 85);
  });
});
