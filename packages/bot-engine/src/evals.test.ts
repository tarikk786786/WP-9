import test from 'node:test';
import assert from 'node:assert/strict';
import { routeModel } from './ai/model-router';
import { evaluateReplyQuality } from './orchestrate/quality-judge';
import { rememberFact, recallFacts } from './memory/memory-manager';
import { generateEmbedding, cosineSimilarity } from './memory/embeddings';

test('WP-9 Evaluation Suite: Model Routing', () => {
  const fastTurn = routeModel({ text: 'haan theek hai' });
  assert.equal(fastTurn.tier, 'fast');

  const reasoningTurn = routeModel({ text: 'Please calculate the detailed breakdown and compare these proposals', hasTools: true });
  assert.equal(reasoningTurn.tier, 'reasoning');
});

test('WP-9 Evaluation Suite: Response Quality Judge', () => {
  const roboticDraft = 'Certainly! As an AI language model, how may I assist you today?';
  const evalResult = evaluateReplyQuality(roboticDraft, 'hi');
  assert.equal(evalResult.passed, false); // correctly flagged as low quality raw draft
  assert.ok(evalResult.feedback.length > 0);
  assert.ok(!evalResult.sanitizedText.includes('As an AI'));
  assert.ok(!evalResult.sanitizedText.includes('Certainly!'));

  const naturalDraft = 'haan main dekh raha hoon, kal tak ho jayega';
  const naturalResult = evaluateReplyQuality(naturalDraft, 'update kya hai');
  assert.equal(naturalResult.passed, true);
  assert.ok(naturalResult.score >= 80);
});

test('WP-9 Evaluation Suite: Semantic Memory (pgvector logic)', async () => {
  const chatId = 'test_user_99';
  await rememberFact(chatId, 'User prefers meeting at 4 PM on Fridays', 'preference', 3);
  
  const recalled = await recallFacts(chatId, 'meeting at 4 PM', 3, 0.20);
  assert.ok(recalled.length > 0);
  assert.ok(recalled[0].fact.includes('4 PM'));
});

test('WP-9 Evaluation Suite: Embeddings & Cosine Similarity', async () => {
  const vec1 = await generateEmbedding('website development pricing');
  const vec2 = await generateEmbedding('cost to build web app');
  const vec3 = await generateEmbedding('chocolate cake recipe');

  const simClose = cosineSimilarity(vec1, vec2);
  const simFar = cosineSimilarity(vec1, vec3);

  assert.ok(simClose > simFar, `Expected simClose (${simClose}) > simFar (${simFar})`);
});
