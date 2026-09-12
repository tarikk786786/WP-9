import test from 'node:test';
import assert from 'node:assert/strict';
import {
  type TemporalFact,
  temporalEngine,
  conflictResolver,
  forgettingEngine,
  privacyScopeGuard,
} from './index.ts';

test('Context Graph: TemporalEngine filters active facts vs expired facts', () => {
  const now = Date.now();
  const facts: TemporalFact[] = [
    {
      factId: 'fact_1',
      chatId: 'user_1',
      subject: 'user_1',
      predicate: 'works_at',
      object: 'Company A',
      validFrom: now - 100000,
      validUntil: now - 1000, // Expired
      observedAt: now - 100000,
      source: 'explicit_user',
      confidence: 1.0,
      status: 'ACTIVE',
      scope: 'private',
    },
    {
      factId: 'fact_2',
      chatId: 'user_1',
      subject: 'user_1',
      predicate: 'works_at',
      object: 'Company B',
      validFrom: now - 900,
      observedAt: now - 900,
      source: 'explicit_user',
      confidence: 1.0,
      status: 'ACTIVE',
      scope: 'private',
    },
  ];

  const active = temporalEngine.getActiveFacts(facts, now);
  assert.equal(active.length, 1);
  assert.equal(active[0].object, 'Company B');
});

test('Context Graph: ConflictResolver resolves explicit newer preference over old preference', () => {
  const now = Date.now();
  const initialFacts: TemporalFact[] = [
    {
      factId: 'pref_1',
      chatId: 'user_1',
      subject: 'user_1',
      predicate: 'prefers_language',
      object: 'English',
      validFrom: now - 50000,
      observedAt: now - 50000,
      source: 'inferred',
      confidence: 0.7,
      status: 'ACTIVE',
      scope: 'private',
    },
  ];

  const newFact: TemporalFact = {
    factId: 'pref_2',
    chatId: 'user_1',
    subject: 'user_1',
    predicate: 'prefers_language',
    object: 'Hinglish',
    validFrom: now,
    observedAt: now,
    source: 'explicit_user', // Explicit beats inferred
    confidence: 1.0,
    status: 'ACTIVE',
    scope: 'private',
  };

  const { updatedFacts, supersededFactId } = conflictResolver.resolveAndSupersede(initialFacts, newFact);
  assert.equal(supersededFactId, 'pref_1');
  assert.equal(updatedFacts.find((f) => f.factId === 'pref_1')?.status, 'SUPERSEDED');
  assert.equal(updatedFacts.find((f) => f.factId === 'pref_2')?.status, 'ACTIVE');
});

test('Context Graph: ForgettingEngine deletes facts and recognizes forget intent', () => {
  const check = forgettingEngine.isForgettingIntent('kripya mera purana data bhool jao');
  assert.equal(check.isForgetting, true);

  const facts: TemporalFact[] = [
    {
      factId: 'fact_3',
      chatId: 'chat_123',
      subject: 'chat_123',
      predicate: 'city',
      object: 'Delhi',
      validFrom: Date.now() - 1000,
      observedAt: Date.now() - 1000,
      source: 'explicit_user',
      confidence: 1.0,
      status: 'ACTIVE',
      scope: 'private',
    },
  ];

  const deleted = forgettingEngine.deleteChatMemory(facts, 'chat_123');
  assert.equal(deleted[0].status, 'DELETED');
});

test('Context Graph: PrivacyScopeGuard strictly prevents private memories from leaking into groups', () => {
  const facts: TemporalFact[] = [
    {
      factId: 'fact_priv',
      chatId: 'dazy_chat',
      subject: 'dazy',
      predicate: 'nickname',
      object: 'jaan',
      validFrom: Date.now() - 1000,
      observedAt: Date.now() - 1000,
      source: 'explicit_user',
      confidence: 1.0,
      status: 'ACTIVE',
      scope: 'private',
    },
  ];

  // Query in a group context
  const groupVisible = privacyScopeGuard.filterFactsForContext(facts, {
    chatId: 'community_group@g.us',
    isGroup: true,
    authorizedScope: 'group',
  });
  assert.equal(groupVisible.length, 0); // Strictly blocked
});
