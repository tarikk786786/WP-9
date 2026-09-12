import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { skillsRegistry } from "../skills/skills-registry.ts";
import { personalityEngine } from "../personality/personality-engine.ts";

describe("WP-9 Master Evaluation Suite: Skills & Personality Intelligence", () => {
  it("Smalltalk skill handles casual greetings and pleasantries with humble warmth", async () => {
    const res = await skillsRegistry.evaluate({
      chatId: "919114411026@s.whatsapp.net",
      sender: "919114411026@s.whatsapp.net",
      fromName: "Friend",
      rawText: "kaise ho",
      normalizedText: "kaise ho",
      intent: "greeting",
      emotion: "neutral",
      isDazy: false,
    });

    assert.ok(res);
    assert.equal(res.skillId, "smalltalk");
    assert.match(res.replyText, /main badhiya hoon|aap bataiye/i);
  });

  it("Business skill provides verified portfolio and contact facts without hallucination", async () => {
    const res = await skillsRegistry.evaluate({
      chatId: "919114411026@s.whatsapp.net",
      sender: "919114411026@s.whatsapp.net",
      fromName: "Client",
      rawText: "portfolio kahan dekhun",
      normalizedText: "portfolio kahan dekhun",
      intent: "portfolio",
      emotion: "neutral",
      isDazy: false,
    });

    assert.ok(res);
    assert.equal(res.skillId, "business");
    assert.match(res.replyText, /tarikislam\.in/i);
  });

  it("Personality engine dynamically adapts tone for frustrated users vs DAZY", () => {
    // 1. Frustrated user
    const frustratedProfile = personalityEngine.calibrate({
      isDazy: false,
      emotion: "frustrated",
      emotionIntensity: 4,
      messageLength: 8,
    });
    assert.equal(frustratedProfile.empathy, 100);
    assert.equal(frustratedProfile.humor, 0, "No inappropriate humor when user is frustrated");
    assert.ok(frustratedProfile.emojiUsage <= 20, "Minimal emoji usage during frustration");

    // 2. DAZY contact
    const dazyProfile = personalityEngine.calibrate({
      isDazy: true,
      emotion: "romantic",
      emotionIntensity: 3,
    });
    assert.equal(dazyProfile.warmth, 100);
    assert.equal(dazyProfile.playfulness, 85);
    assert.equal(dazyProfile.formality, 0, "Zero bureaucratic formality for DAZY");
  });
});
