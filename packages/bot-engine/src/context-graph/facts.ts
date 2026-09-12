/**
 * Temporal Facts & Provenance
 * Graphiti-inspired fact model tracking validity windows and supersession.
 */

export type FactLifecycleStatus = 'ACTIVE' | 'SUPERSEDED' | 'EXPIRED' | 'DELETED';
export type FactSource = 'explicit_user' | 'inferred' | 'tool' | 'system';
export type MemoryScope = 'private' | 'group' | 'system';

export interface TemporalFact {
  factId: string;
  chatId: string;
  subject: string;
  predicate: string; // e.g. works_at, lives_in, prefers_language, asked_about
  object: string;
  validFrom: number; // Unix timestamp ms
  validUntil?: number; // Optional end of validity
  observedAt: number;
  source: FactSource;
  confidence: number; // 0 to 1
  supersedes?: string; // factId of fact this replaces
  status: FactLifecycleStatus;
  scope: MemoryScope;
}
