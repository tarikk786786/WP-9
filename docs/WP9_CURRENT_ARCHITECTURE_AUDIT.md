# WP-9 Current Architecture Audit

This audit document establishes the verified baseline of the WP-9 codebase prior to executing the Master PRD transformation. It maps out all event paths, generation pipelines, database structures, deployment configurations, and runtime behaviors.

---

## 1. Inbound Event Paths

### Primary Ingress: Baileys Worker (`apps/worker/src/whatsapp.ts`)
- **`sock.ev.on("messages.upsert")` (Line 881)**:
  - **Live Filter**: Only processes events where `type === "notify"`. Appends and historical batches are ignored.
  - **Recency & Skew Filter**: Rejects messages older than 5 minutes (`ageMs > 300_000`) or future clock skew beyond 2 minutes (`ageMs < -120_000`).
  - **Self-Message Gate**: Rejects messages where `raw.key.fromMe === true`.
  - **Channel Gate**: Rejects `@broadcast` and `status@broadcast` status messages.
  - **Stub Gate**: If message content is an un-decrypted stub (`isInboundStub`), defers processing up to 3 seconds for Baileys session key arrival.
  - **Database Persistence**:
    - Calls `upsertCustomer(...)`
    - Calls `upsertConversation(customer.id, jid)`
    - Calls `addMessage(...)` for persistent audit history.
  - **Handoff to Brain**: Hands off to `conversationEngine.acceptInboundEvent(...)` with:
    `{ tenantId, chatId, messageId, text, sender, fromName, timestamp, quoted, isGroup, mediaType }`.

- **`sock.ev.on("messages.update")` (Line 897)**:
  - Updates in-memory decrypted payload cache (`inboundStore.set(id, message)`).
  - **Invariant Protected**: Never spawns or triggers conversational turns or replies.

- **`sock.ev.on("messaging-history.set")` (Line 912)**:
  - Caches historical messages from phone/web client sync into memory store.
  - **Invariant Protected**: Strictly ignored by conversational turn processing.

---

## 2. Response Generation Paths

### Authoritative Engine: `AuthoritativeConversationEngine` (`packages/bot-engine/src/conversation-engine/index.ts`)
The entire conversational lifecycle is processed through a deterministic 11-step pipeline:

```text
EventGate (Deduplication Layer 1-3)
  └── Atomic Claim: claimInboundEvent (status: 'CLAIMED', lease: 60s)
        └── TurnBuilder (Debounce: 350ms general / 300ms DAZY; max 2000ms)
              └── ChatLock: ConversationLockManager (Single-flight per chat)
                    ├── UnderstandingEngine (Intent, Language, Emotion, Entities)
                    ├── CanonicalContextBuilder (Anaphora resolution: "ye", "woh", "iska")
                    ├── DecisionEngine (REPLY vs. NO_REPLY vs. ESCALATE)
                    │     ├── Bot disabled in settings → NO_REPLY
                    │     ├── Human handoff active → NO_REPLY
                    │     └── Reaction/Duplicate/Ack → NO_REPLY
                    ├── ToolRunner (Safe isolated schema tools)
                    ├── ModelRouter (Deterministic → Fast LLM → Strong LLM → Local AI → Fallback)
                    ├── ResponsePlanner (Tone, humility, length, follow-up constraints)
                    ├── ResponseQualityGate (HumanLanguageQualityEngine: 8-stage humility/grammar/spelling)
                    └── ResponseCommitManager (Atomic UNIQUE turn commit)
                          └── WhatsAppOutbox (Transactional outbox delivery)
```

---

## 3. Direct Send Paths Audit

### Verified Socket Send Locations
- **`apps/worker/src/whatsapp.ts` (Line 98)**:
  - `sendText(targetJid, text)`: Internal helper executing `sock.sendMessage(targetJid, { text })`.
  - **Usage**:
    - Line 105: Used exclusively by `messageOutbox.setSender(...)` inside the transactional outbox loop.
    - Line 516 (`sendWhatsApp`): Used by authorized admin dashboard manual API calls (`POST /send`), which also generates a unique outbox response ID.
- **Rule 4 & 5 Verification**:
  - No AI model, prompt runner, fallback generator, tool, or FAQ rule directly calls `sock.sendMessage`.
  - All automated conversational replies flow strictly through `responseCommitManager.commitResponse` → `messageOutbox.enqueue` → `sendText`.

---

## 4. AI & Model Execution Paths

### 1. `ModelRouter` (`packages/bot-engine/src/conversation-engine/model-router.ts`)
- **Failover Hierarchy**:
  1. **Level 0 (Deterministic)**: Matched FAQs, keyword rules, and DAZY spelling intelligence instant matches.
  2. **Level 1 (Fast Cloud AI)**: Groq (`llama-3.3-70b-versatile`) or Google Gemini (`gemini-2.0-flash`).
  3. **Level 2 (Strong Reasoning AI)**: OpenAI (`gpt-4o` / `gpt-4o-mini`) or Anthropic.
  4. **Level 3 (Local AI / llama.cpp)**: Self-hosted OpenAI-compatible server at `LOCAL_AI_URL` or `LLAMA_CPP_URL`.
  5. **Level 4 (Deterministic Fallback)**: `writeCompleteFallback` + `writeSpokenReply` covering all user asks.
- **Safety Aborts**: Every model call is bounded by an `AbortController` (4-second timeout) to prevent hung turns.

---

## 5. Fallback Paths

- **`writeCompleteFallback` (`packages/bot-engine/src/ai/fallback.ts`)**:
  - Deterministically extracts all inquiries from the user's turn.
  - Combines verified facts (pricing, portfolio, availability, location, contact) without hallucination.
- **`writeSpokenReply` (`packages/bot-engine/src/orchestrate/spoken.ts`)**:
  - Formats conversational replies into natural, spoken Hinglish or English.
  - Strips corporate jargon and AI markers.

---

## 6. Database State & Migrations

### Supabase / PostgreSQL Tables (`supabase/migrations/`)
- **`0001_init.sql`**: Customers, conversations, messages, faqs, automation_rules, knowledge_items, bot_settings, logs.
- **`0002_worker_lease_and_heartbeat.sql`**: Worker leases and heartbeats for distributed deployment.
- **`0003_pgvector_memory.sql`**: `pgvector` extension and vector embeddings for semantic knowledge memory.
- **`0004_authoritative_conversation_engine.sql`**:
  - `message_dedup`: `(message_id, event_id, content_hash, normalized_hash)`
  - `conversation_turns`: `(turn_id, chat_id, message_ids, combined_text, status)`
  - `response_commits`: `(response_id, turn_id, chat_id, final_text, status)` with `UNIQUE(turn_id)` and `UNIQUE(response_id)`
  - `conversation_locks`: `(chat_id, turn_id, owner_id, expires_at)`
- **`0006_delivery_state_machine.sql`**:
  - `inbound_event_claims`: `(event_id, status, owner_id, lease_until, turn_id, attempt_count)`
  - `no_reply_decisions`: `(turn_id, chat_id, reason, message_ids)`

---

## 7. Outbox & Delivery State Machine

### `WhatsAppOutbox` (`packages/bot-engine/src/conversation-engine/outbox.ts`)
- **States**: `PENDING` → `SENDING` → `SENT` (or `RETRYABLE` → `FAILED`).
- **Atomic Guarantee**: Responses are enqueued strictly via `responseCommitManager.commitResponse`.
- **Send Retry Behavior**: On network timeout, transport retries delivery of the **exact same response record**. It never re-invokes AI generation or generates a different response.

---

## 8. Deployment Targets & Runtime Configurations

| Target | Role | Config File | Healthcheck | Persistent Storage |
|---|---|---|---|---|
| **Render** | Production Baileys 24/7 Worker | `render.yaml`, `Dockerfile` | `GET /health/live` (20s) | Volume `/app/data` |
| **Railway** | Production Alternative Worker | `railway.json`, `Dockerfile` | `GET /health/live` (100s) | Volume `/app/data` |
| **Fly.io** | Regional Backup Worker | `fly.toml`, `Dockerfile` | `GET /health/live` (20s) | Volume `/app/data` |
| **Vercel** | Admin UI & Dashboard Control Plane | Next.js App (`apps/web`) | `/api/health` | Stateless (Supabase DB) |
| **Docker Compose** | Local Development Stack | `docker-compose.yml` | Healthcheck script | Named volume `worker-auth` |

---

## 9. Worker Startup & Session Persistence

1. **`ensureAlwaysOn()` (`apps/worker/src/whatsapp.ts:454`)**:
   - Migrates legacy auth files if necessary.
   - Starts `ConnectionGuardian` to supervise Baileys connection state.
   - Sets outbox sender function to route through `whatsappCircuitBreaker`.
   - Initializes outbox from database (`outbox.initFromDatabase()`) to resume any un-sent commits.
   - Starts Baileys socket (`startWhatsApp()`).
   - Starts health pulse (`pulseWhatsApp()`) every 20 seconds.
2. **Session Persistence**:
   - Stored in `BAILEYS_AUTH_DIR` (default: `/app/data/baileys-auth` on persistent volume).
   - In-memory backup archive exported periodically to Supabase storage / database to allow seamless restart across cloud ephemeral upgrades.
