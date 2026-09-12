import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TruthLevel,
  compareTruthPriority,
  claimExtractor,
  EvidenceCollector,
  unknownHandler,
  groundingChecker,
} from './index.ts';

test('Grounding: enforces truth hierarchy priority', () => {
  assert.ok(
    compareTruthPriority(
      TruthLevel.CURRENT_VERIFIED_TOOL_DATA,
      TruthLevel.GENERAL_MODEL_KNOWLEDGE
    ) < 0
  );
  assert.ok(
    compareTruthPriority(
      TruthLevel.TRUSTED_INTERNAL_DATABASE,
      TruthLevel.APPROVED_KNOWLEDGE
    ) < 0
  );
});

test('Grounding: extracts factual claims for prices, links, and locations', () => {
  const text = 'Website cost is ₹25,000. You can visit https://tarikislam.in or meet in Muzaffarpur.';
  const claims = claimExtractor.extractClaims(text);
  assert.equal(claims.length, 3);
  assert.ok(claims.some((c) => c.claimType === 'price'));
  assert.ok(claims.some((c) => c.claimType === 'contact'));
  assert.ok(claims.some((c) => c.claimType === 'location'));
});

test('Grounding: UnknownHandler qualifies uncertain, unknown, and conflicting states', () => {
  // Unknown
  const resUnknown = unknownHandler.evaluate(4, 0, false);
  assert.equal(resUnknown.state, 'UNKNOWN');
  assert.equal(resUnknown.shouldQualify, true);

  // Conflicting
  const resConflict = unknownHandler.evaluate(4, 2, true);
  assert.equal(resConflict.state, 'CONFLICTING');
  assert.equal(resConflict.shouldQualify, true);

  // Known
  const resKnown = unknownHandler.evaluate(4, 4, false);
  assert.equal(resKnown.state, 'KNOWN');
  assert.equal(resKnown.shouldQualify, false);
});

test('Grounding: GroundingChecker repairs ungrounded price hallucinations', () => {
  const draftWithHallucination = 'I will build your complete portal for ₹50,000 INR.';
  const evidence = [
    EvidenceCollector.createDatabaseEvidence('profile', 'Tarik Islam is a Cyber Security Expert in Muzaffarpur, India.'),
  ];

  const audit = groundingChecker.verify(draftWithHallucination, evidence);
  assert.equal(audit.grounded, false);
  assert.ok(audit.unsupportedClaims.some((c) => c.claimType === 'price'));
  assert.ok(audit.repairedText);
  assert.ok(audit.repairedText.includes('scope aur requirements pe depend'));
});
