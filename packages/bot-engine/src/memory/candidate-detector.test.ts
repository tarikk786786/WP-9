import test from "node:test";
import assert from "node:assert/strict";
import {
  detectMemoryCandidates,
  isTransientMessage,
  containsSensitiveData,
} from "./candidate-detector.ts";

test("Memory Candidate Detector: recognizes transient smalltalk and ignores it", () => {
  assert.equal(isTransientMessage("hi"), true);
  assert.equal(isTransientMessage("hello!"), true);
  assert.equal(isTransientMessage("theek hai"), true);
  assert.equal(isTransientMessage("ok done"), true);
  assert.equal(isTransientMessage("good night"), true);
  assert.equal(isTransientMessage("I need an enterprise CRM built for logistics"), false);

  const candidates = detectMemoryCandidates("ok bhai, theek hai kal milte hain");
  // Should not extract transient chatter
  assert.equal(candidates.length, 0);
});

test("Memory Candidate Detector: blocks sensitive PII, Aadhaar, and card numbers", () => {
  assert.equal(containsSensitiveData("My Aadhaar is 1234 5678 9012"), true);
  assert.equal(containsSensitiveData("PAN: ABCDE1234F"), true);
  assert.equal(containsSensitiveData("Card: 4111 2222 3333 4444"), true);
  assert.equal(containsSensitiveData("my budget is ₹25,000 for web app"), false);

  // Sensitive messages yield 0 candidates
  const candidates = detectMemoryCandidates("Here is my card 4111 2222 3333 4444 and CVV: 123");
  assert.equal(candidates.length, 0);
});

test("Memory Candidate Detector: extracts language preferences, budget, and requirements", () => {
  // Test language preference
  const langCandidates = detectMemoryCandidates("please speak in hindi from now on");
  assert.equal(langCandidates.length > 0, true);
  assert.equal(langCandidates[0].category, "preference");
  assert.equal(langCandidates[0].value, "hindi");

  // Test budget and requirement extraction
  const projectCandidates = detectMemoryCandidates("I need a new ecommerce website, my budget is around ₹45,000");
  assert.equal(projectCandidates.length >= 2, true);

  const req = projectCandidates.find((c) => c.category === "requirement");
  const bgt = projectCandidates.find((c) => c.category === "budget");

  assert.ok(req);
  assert.equal(req?.value, "ecommerce");

  assert.ok(bgt);
  assert.ok(bgt?.value.includes("45,000"));
});
