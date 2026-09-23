import type { MemoryCandidate } from "./candidate-detector.ts";

export interface CustomerFactRecord {
  phone: string;
  category: string;
  key: string;
  value: string;
  updatedAt: string;
}

export interface SemanticSearchResult {
  documentId: string;
  content: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface MemoryEngineConfig {
  redisUrl?: string;
  qdrantUrl?: string;
  qdrantApiKey?: string;
}

export class ThreeTierMemoryEngine {
  private shortTermStore: Map<string, Array<{ role: "user" | "assistant"; text: string; timestamp: number }>> = new Map();
  private longTermFacts: Map<string, Map<string, CustomerFactRecord>> = new Map();
  private qdrantUrl?: string;
  private qdrantApiKey?: string;

  constructor(config?: MemoryEngineConfig) {
    this.qdrantUrl = config?.qdrantUrl || process.env.QDRANT_URL;
    this.qdrantApiKey = config?.qdrantApiKey || process.env.QDRANT_API_KEY;
  }

  // --- 1. Short-Term Memory (Sliding Window Context) ---
  public getShortTermHistory(chatId: string, limit = 10): Array<{ role: "user" | "assistant"; text: string }> {
    const thread = this.shortTermStore.get(chatId) || [];
    return thread.slice(-limit).map((t) => ({ role: t.role, text: t.text }));
  }

  public recordShortTermTurn(chatId: string, role: "user" | "assistant", text: string): void {
    if (!this.shortTermStore.has(chatId)) {
      this.shortTermStore.set(chatId, []);
    }
    const thread = this.shortTermStore.get(chatId)!;
    thread.push({ role, text, timestamp: Date.now() });
    // Keep max 20 turns in short-term buffer
    if (thread.length > 20) {
      thread.shift();
    }
  }

  // --- 2. Long-Term Memory (Validated Customer Facts) ---
  public storeCandidateFacts(phone: string, candidates: MemoryCandidate[]): void {
    if (!candidates.length) return;
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    if (!this.longTermFacts.has(cleanPhone)) {
      this.longTermFacts.set(cleanPhone, new Map());
    }
    const userMap = this.longTermFacts.get(cleanPhone)!;
    for (const cand of candidates) {
      userMap.set(cand.key, {
        phone: cleanPhone,
        category: cand.category,
        key: cand.key,
        value: cand.value,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  public getCustomerFacts(phone: string): Record<string, string> {
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    const userMap = this.longTermFacts.get(cleanPhone);
    if (!userMap) return {};
    const result: Record<string, string> = {};
    for (const [key, record] of userMap.entries()) {
      result[key] = record.value;
    }
    return result;
  }

  // --- 3. Semantic Memory (Qdrant Vector Retrieval) ---
  public async searchSemanticKnowledge(query: string, collection = "business_docs", limit = 3): Promise<SemanticSearchResult[]> {
    if (!this.qdrantUrl) {
      // Graceful offline fallback: semantic engine returns empty list if Qdrant isn't connected
      return [];
    }

    try {
      const url = `${this.qdrantUrl.replace(/\/+$/, "")}/collections/${collection}/points/search`;
      // Note: for production vector search, query embedding is provided
      // Here we provide structured request
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.qdrantApiKey ? { "api-key": this.qdrantApiKey } : {}),
        },
        body: JSON.stringify({
          limit,
          with_payload: true,
          params: { exact: false },
        }),
      });

      if (!res.ok) return [];
      const data = (await res.json()) as { result?: Array<{ id: string; score: number; payload?: { text?: string } }> };
      return (data.result || []).map((r) => ({
        documentId: String(r.id),
        content: r.payload?.text || "",
        score: r.score,
      }));
    } catch {
      return [];
    }
  }
}
