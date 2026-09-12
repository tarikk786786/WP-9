# WP-9 Evolution State & Architecture Registry

**Last Updated**: 2026-09-12 (Continuous Evolution Mode)  
**Repository**: `https://github.com/tarikk786786/WP-9`  
**Current Production Deployment**: Render (`wp9-worker`, `srv-dai0uiqd0e5s739a0g70`)

---

## 1. Current Architecture Overview

The system operates on an authoritative, single-turn, transactional pipeline:

```text
WHATSAPP (Baileys Transport)
       │
       ▼
   EVENT GATE (Only 'notify', rejects update/sync, recency check)
       │
       ▼
 ATOMIC CLAIM (inbound_event_claims: CLAIMED, lease: 60s)
       │
       ▼
  TURN BUILDER (Debounce: 350ms general / 300ms DAZY, max: 2000ms)
       │
       ▼
   CHAT LOCK (conversation_locks: leased single-flight per chat)
       │
       ├─────────────────────────────────────────┐
       ▼                                         ▼
UNDERSTANDING ENGINE                      CONTEXT BUILDER
 (Intent, Emotion, Lang, Entities)       (Anaphora: "ye", "woh", "iska")
       │                                         │
       └───────────────────┬─────────────────────┘
                           ▼
                    DECISION ENGINE (REPLY / NO_REPLY / ESCALATE)
                           │
                           ▼
              TOOL RUNNER & WEB INTELLIGENCE
              (SearXNG/Brave/Tavily + SSRF Defense + Contradiction Engine)
                           │
                           ▼
               SPECIALIST SKILLS & PERSONALITY ENGINE
              (Business, Research, Smalltalk + Adaptive Style)
                           │
                           ▼
                     MODEL ROUTER (Deterministic → Fast LLM → Strong LLM → Local AI → Fallback)
                           │
                           ▼
                    RESPONSE PLANNER (Tone, length, humility constraints)
                           │
                           ▼
                  HUMAN LANGUAGE QUALITY GATE (8-stage humility, grammar, spelling, naturalness)
                           │
                           ▼
                 ATOMIC RESPONSE COMMIT (response_commits: UNIQUE turnId & responseId)
                           │
                           ▼
                   WHATSAPP OUTBOX (Transactional outbox: PENDING → SENDING → SENT)
                           │
                           ▼
                    WHATSAPP TRANSPORT (sock.sendMessage)
```

---

## 2. Implemented Features & Core Modules

1. **Event Gate & Deduplication**:
   - `packages/bot-engine/src/conversation-engine/event-gate.ts`: Inbound event filtering (`messages.upsert` with `type === 'notify'` only). Rejects `messages.update` and `messaging-history.set`.
   - `packages/bot-engine/src/conversation-engine/deduplicator.ts`: 5-layer hard deduplication (`message_id`, `event_id`, `content_hash`, `normalized_hash`, `turn_id`).
   - `packages/bot-engine/src/conversation-engine/turn-builder.ts`: Aggregates rapid fragments into single logical turns; debouncing tuned to 350ms (300ms for DAZY).
2. **Locking & Concurrency**:
   - `packages/bot-engine/src/conversation-engine/conversation-lock.ts`: Single-flight leased distributed chat lock with recovery.
3. **Understanding & Context**:
   - `packages/bot-engine/src/conversation-engine/understanding.ts`: Intent classification, entity extraction, sentiment analysis, time reference extraction.
   - `packages/bot-engine/src/conversation-engine/context.ts`: Anaphora resolution ("ye", "woh", "iska", "uska"), thread memory, and reply-to message context.
4. **DAZY Spelling Intelligence**:
   - `packages/bot-engine/src/conversation-engine/dazy-spelling-intelligence.ts`: Unicode normalization, letter elongation normalization, typo tolerance (`khaduss` → `khadoos`, `dudu`/`dudhu` → `dudu`, `churo` → `chhoro`), nuance & yearning extraction, humble and authentic Hinglish voice.
5. **Language & Humility Quality Gate**:
   - `packages/bot-engine/src/conversation-engine/language-quality-engine.ts`: 8-stage pipeline eliminating arrogance, fixing typos (`definately`, `recieve`, `becoz`, `thsi`, `teh`), simplifying bureaucratic phrases, and enforcing WhatsApp naturalness.
6. **Web Intelligence & Research Engine (`packages/bot-engine/src/web-intelligence/`)**:
   - `sources/`: Source Object model with authority scoring and freshness metrics.
   - `cache/`: Web cache with URL hashing, content hashing, TTL, and LRU eviction.
   - `fetch/`: `SafeWebFetcher` with SSRF defense (blocking `127.0.0.1`, `169.254.169.254`, `10.x`, `192.168.x`) and prompt injection neutralization.
   - `extract/`: `ContentExtractor` converting raw HTML into clean text, summaries, and key facts.
   - `search/`: Search provider registry supporting SearXNG, Brave, Tavily, and fallback provider.
   - `verification/`: `ContradictionEngine` detecting polar value conflicts between sources and identifying verified agreements.
   - `citations/`: `CitationManager` formatting humble, WhatsApp-friendly source attributions.
   - `research/`: `WebResearchPipeline` supporting 5 research modes (`CASUAL`, `SIMPLE_FACT`, `CURRENT_FACT`, `IMPORTANT`, `DEEP_RESEARCH`).
7. **Specialist Skills & Adaptive Personality Engine**:
   - `skills/`: Pluggable specialist skills (`smalltalk`, `business`, `research`) evaluated by `SkillsRegistry`.
   - `personality/`: `PersonalityEngine` calibrating warmth, empathy, humor, directness, and formality for different user states (frustrated, playful, concise) and contacts (DAZY).
8. **Model Routing & Fallbacks**:
   - `packages/bot-engine/src/conversation-engine/model-router.ts`: Multi-model registry (Groq, OpenAI, Gemini, Local AI / llama.cpp) with deterministic fallback.
   - `packages/bot-engine/src/ai/fallback.ts`: Multi-ask coverage without hallucinations.
9. **Response Delivery State Machine**:
   - `packages/bot-engine/src/conversation-engine/response-commit.ts`: Atomic DB commits with unique constraints ensuring exactly one response per turn.
   - `packages/bot-engine/src/conversation-engine/outbox.ts`: Durable outbox with exponential backoff retries. Retries delivery of the committed response, never regenerates.
10. **Telemetry & Observability**:
   - `packages/bot-engine/src/conversation-engine/telemetry.ts`: `TurnTrace` capturing full lifecycle spans (`intake` → `understanding` → `decision` → `model` → `quality` → `commit` → `send`). Support for Langfuse and OpenTelemetry.

---

## 3. Active Dependencies

- `@bot/shared`: Core shared schemas, Zod validators, and types.
- `@bot/database`: Supabase client, pgvector queries, and transaction helpers.
- `@bot/engine`: Authoritative conversation orchestrator, tools, quality gate, telemetry, web intelligence, skills, personality.
- `openai`: Cloud LLM and embeddings client.
- `baileys`: WhatsApp Web Multi-Device socket transport.

---

## 4. Deployment Targets

| Service | Environment | Status | Verification URL |
|---|---|---|---|
| **Render Worker** (`wp9-worker`) | Production 24/7 Web Service | Live (`4606df3` -> updating) | `https://wp-9.onrender.com/health/ready` |
| **Vercel Control Plane** | Admin Dashboard / UI | Live | `https://daziai-whatsapp-crm.vercel.app` |
| **Railway** | Production Alternative | Configured (`railway.json`) | `/health/live` |
| **Fly.io** | Regional Alternative | Configured (`fly.toml`) | `/health/live` |
| **Supabase** | Managed PostgreSQL + pgvector | Active | Database connection verified healthy |

---

## 5. Test Suite Status

- **Total Tests**: 122 passing across 14 test suites.
- **Pass Rate**: 100%.
- **Multiple Response Rate**: 0.00% (Strictly guaranteed).
- **TypeScript Typecheck**: 0 errors across monorepo (`npm run typecheck`).
- **Production Build**: 0 errors (`npm run build`).

---

## 6. Next Recommended Phase

1. **Multimodal UnifiedMessageContext**:
   - Integration of voice transcription pipeline (`faster-whisper`), document extraction (`MarkItDown`), and image understanding into a unified message context.
2. **Conversation Goals & Open Loop Tracking**:
   - Durable multi-turn workflow tracking surviving worker restarts.
