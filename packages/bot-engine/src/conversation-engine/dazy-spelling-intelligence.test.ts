import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeDazyMessage } from "./dazy-spelling-intelligence.ts";
import { evaluateDazyMessage } from "./dazy-profile.ts";

describe("DAZY — Spelling Intelligence & Normalization", () => {
  it("never modifies the original raw message string", () => {
    const raw = "oye mera khaduss kaha hoooo";
    const res = normalizeDazyMessage(raw);
    assert.equal(res.rawText, raw);
    assert.equal(typeof res.normalizedText, "string");
    assert.equal(typeof res.semanticText, "string");
  });

  it("normalizes repeated characters and captures emotional yearning", () => {
    const res = normalizeDazyMessage("heyyyy yaaaar achaaaa 😭");
    assert.match(res.normalizedText, /hey/i);
    assert.match(res.normalizedText, /yaar/i);
    assert.match(res.normalizedText, /achha/i);
    assert.equal(res.hasYearning, true);
    assert.equal(res.emotionIntensity, "high");
  });

  it("handles input typo tolerance across all canonical variations", () => {
    // 1. khadoos variations
    for (const v of ["khaduss", "khadoos", "khadus", "khadusss"]) {
      const res = normalizeDazyMessage(v);
      assert.match(res.normalizedText, /khadoos/i);
      assert.ok(res.matchedPrivateTerms.includes("khadoos"));
    }

    // 2. churo / churdo variations
    for (const v of ["churo", "churu", "churdo", "churdoo"]) {
      const res = normalizeDazyMessage(v);
      assert.match(res.normalizedText, /chhoro/i);
      assert.ok(res.matchedPrivateTerms.includes("chhoro"));
    }

    // 3. dudu variations
    for (const v of ["dudu", "dudhu", "doodhu", "doodoo"]) {
      const res = normalizeDazyMessage(v);
      assert.match(res.normalizedText, /dudu/i);
      assert.ok(res.matchedPrivateTerms.includes("dudu"));
    }

    // 4. acha variations
    for (const v of ["acha", "accha", "achaa", "achaaa"]) {
      const res = normalizeDazyMessage(v);
      assert.match(res.normalizedText, /achha/i);
    }

    // 5. nahi variations
    for (const v of ["nhi", "nai", "nah", "naah"]) {
      const res = normalizeDazyMessage(v);
      assert.match(res.normalizedText, /nahi/i);
    }

    // 6. karna variations
    for (const v of ["krna", "krnaaa", "karna"]) {
      const res = normalizeDazyMessage(v);
      assert.match(res.normalizedText, /karna/i);
    }

    // 7. batao variations
    for (const v of ["btao", "btana", "batao"]) {
      const res = normalizeDazyMessage(v);
      assert.match(res.normalizedText, /batao/i);
    }

    // 8. mujhe variations
    for (const v of ["mujhe", "muje", "mujhy"]) {
      const res = normalizeDazyMessage(v);
      assert.match(res.normalizedText, /mujhe/i);
    }

    // 9. tum variations
    for (const v of ["tum", "tm", "tumm"]) {
      const res = normalizeDazyMessage(v);
      assert.match(res.normalizedText, /tum/i);
    }

    // 10. hai variations
    for (const v of ["hai", "h", "he"]) {
      const res = normalizeDazyMessage("kya " + v);
      assert.match(res.normalizedText, /hai/i);
    }
  });

  it("handles Indian phonetic typing (muje, bohot, q, ptaa, krungi, rha)", () => {
    const res = normalizeDazyMessage("muje bohot yaad aa rha hai, q ni aaye?");
    assert.match(res.normalizedText, /mujhe/);
    assert.match(res.normalizedText, /bahut/);
    assert.match(res.normalizedText, /raha/);
    assert.match(res.normalizedText, /kyun/);
  });

  it("correctly produces the prompt's canonical example: 'oye mera khaduss kaha hoooo'", () => {
    const res = normalizeDazyMessage("oye mera khaduss kaha hoooo");
    assert.equal(res.normalizedText, "oye mera khadoos kahan ho");
    assert.ok(res.matchedPrivateTerms.includes("khadoos"));
    assert.equal(res.isPlayful, true);
    assert.equal(res.suggestedSmartReply, "yahin hoon 😌❤️ itna yaad aa raha tha kya?");
  });

  it("evaluates Dazy messages seamlessly in evaluateDazyMessage without textbook English", () => {
    const evalResult = evaluateDazyMessage("oye mera khaduss kaha hoooo");
    assert.equal(evalResult.isDazy, true);
    assert.equal(evalResult.suggestedReply, "yahin hoon 😌❤️ itna yaad aa raha tha kya?");
    assert.doesNotMatch(evalResult.suggestedReply ?? "", /Where are you, my dear/i);
  });

  it("handles intimate private requests smartly and respectfully", () => {
    const evalDudu = evaluateDazyMessage("ap mujhe dudu doge");
    assert.equal(evalDudu.isDazy, true);
    assert.equal(evalDudu.suggestedReply, "hamesha aapke liye 😌❤️ jo bologe sab aapka hai.");

    const evalKiss = evaluateDazyMessage("kiss me");
    assert.equal(evalKiss.isDazy, true);
    assert.match(evalKiss.suggestedReply ?? "", /pyaar se maangoge/i);
  });

  it("handles personal curiosity about Tarik smartly", () => {
    const evalCuriosity = evaluateDazyMessage("mujhe apke bare me janna hai");
    assert.equal(evalCuriosity.isDazy, true);
    assert.match(evalCuriosity.suggestedReply ?? "", /mere baare mein kya jaanna chahti ho/i);
  });
});