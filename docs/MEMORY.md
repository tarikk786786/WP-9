# WP-9 Memory Architecture

## 1. Multi-Tiered Scoped Memory
WP-9 differentiates memory into three distinct tiers:

1. **Short-Term Memory**:
   - Immediate conversation thread and recent fragments.
   - Reply-to metadata and anaphora references ("ye", "woh", "iska").
   - Buffered in `CanonicalContextBuilder`.

2. **Medium-Term Memory (Episodic Memory)**:
   - Conversation episodes, resolutions, corrections, and topic threads.
   - Persisted in PostgreSQL `conversations` and `messages`.

3. **Long-Term Memory**:
   - User preferences, verified facts, and approved business knowledge.
   - Stored in `knowledge_items` and searched via `pgvector` embeddings (`0003_pgvector_memory.sql`).

## 2. Safety & Tenant Isolation
- Memory is strictly partitioned by `tenantId`, `chatId`, and `customerId`.
- Cross-user memory leakage is architecturally impossible.
- Private contact vocabulary and expressions are contact-scoped.
