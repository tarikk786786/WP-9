import { generateEmbedding, cosineSimilarity } from './embeddings';
import { getSupabaseClient } from '@bot/database';

export interface MemoryItem {
  id?: string;
  chatId: string;
  category: 'fact' | 'preference' | 'profile' | 'business' | 'relationship';
  fact: string;
  importance: number;
  similarity?: number;
  metadata?: Record<string, unknown>;
}

export interface KnowledgeDoc {
  id?: string;
  title: string;
  content: string;
  category: string;
  similarity?: number;
}

// In-memory cache for fast local retrieval
const localMemoryStore: MemoryItem[] = [];

/**
 * Remember a fact about a user or conversation
 */
export async function rememberFact(
  chatId: string,
  fact: string,
  category: MemoryItem['category'] = 'fact',
  importance = 2,
  metadata: Record<string, unknown> = {}
): Promise<boolean> {
  const cleanFact = fact.trim();
  if (!cleanFact) return false;

  const item: MemoryItem = {
    chatId,
    category,
    fact: cleanFact,
    importance,
    metadata,
  };

  // 1. Store in local cache
  localMemoryStore.push(item);
  if (localMemoryStore.length > 1000) {
    localMemoryStore.splice(0, 100);
  }

  // 2. Persist to Supabase pgvector if available
  const db = getSupabaseClient();
  if (db) {
    try {
      const embedding = await generateEmbedding(cleanFact);
      await db.from('memory_items').insert({
        chat_id: chatId,
        category,
        fact: cleanFact,
        importance,
        embedding,
        metadata,
      });
      return true;
    } catch {
      /* local store serves as resilient fallback */
    }
  }

  return true;
}

/**
 * Recall relevant facts using vector semantic search
 */
export async function recallFacts(
  chatId: string,
  query: string,
  limit = 4,
  threshold = 0.35
): Promise<MemoryItem[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  // 1. Query Supabase RPC if online
  const db = getSupabaseClient();
  if (db) {
    try {
      const embedding = await generateEmbedding(cleanQuery);
      const { data, error } = await db.rpc('match_memories', {
        query_embedding: embedding,
        match_threshold: threshold,
        match_count: limit,
        filter_chat_id: chatId,
      });
      if (!error && Array.isArray(data) && data.length > 0) {
        return data.map((d: any) => ({
          id: d.id,
          chatId: d.chat_id,
          category: d.category,
          fact: d.fact,
          importance: d.importance,
          similarity: d.similarity,
          metadata: d.metadata,
        }));
      }
    } catch {
      /* fallback to local memory */
    }
  }

  // 2. Query Local In-Memory Store using embedding similarity
  const queryVec = await generateEmbedding(cleanQuery);
  const matched = (
    await Promise.all(
      localMemoryStore
        .filter((m) => m.chatId === chatId)
        .map(async (m) => {
          const mVec = await generateEmbedding(m.fact);
          const sim = cosineSimilarity(queryVec, mVec);
          return { ...m, similarity: sim };
        })
    )
  )
    .filter((m) => (m.similarity || 0) >= threshold)
    .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
    .slice(0, limit);

  return matched;
}


/**
 * Search Knowledge Documents (business RAG)
 */
export async function searchKnowledge(query: string, limit = 3): Promise<KnowledgeDoc[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const db = getSupabaseClient();
  if (db) {
    try {
      const embedding = await generateEmbedding(cleanQuery);
      const { data, error } = await db.rpc('match_knowledge', {
        query_embedding: embedding,
        match_threshold: 0.50,
        match_count: limit,
      });
      if (!error && Array.isArray(data) && data.length > 0) {
        return data.map((d: any) => ({
          id: d.id,
          title: d.title,
          content: d.content,
          category: d.category,
          similarity: d.similarity,
        }));
      }
    } catch {
      /* fallback */
    }
  }

  return [];
}

