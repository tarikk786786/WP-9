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
11. **Authorization & Fine-Grained Permissions (`packages/bot-engine/src/authorization/`)**:
    - `resource-scope.ts`: Typed resource scopes (`chat`, `message`, `tool`, `memory`, `admin`).
    - `action-permissions.ts`: Action permission levels (`read`, `execute`, `write`, `delete`, `admin`) with allowed roles and confirmation requirements.
    - `permission-check.ts`: Relationship-based authorization checker (OpenFGA model) verifying subject roles and scoping.
    - `policy-engine.ts`: OPA-style declarative policy engine evaluating contextual conditions (bot enabled, human handoff, quiet hours, rate limits, confirmation gates).
12. **Contact Identity Resolution & Profiles as Data (`packages/bot-engine/src/identity/`)**:
    - `phone-normalizer.ts`: E.164 and Indian 10-digit mobile number normalization.
    - `jid-resolver.ts`: Dissects PN JIDs (`@s.whatsapp.net`), LIDs (`@lid`), and group JIDs (`@g.us`).
    - `contact-profile-model.ts`: Contact profiles stored as structured data (`contactId`, `displayName`, `language`, `tone`, `warmth`, `romanceLevel`, `formality`, `emojiLevel`, `memoryEnabled`, `relationshipType`, `privateLexiconId`).
    - `relationship-resolver.ts`: Resolves relationship types (`romantic_partner`, `client`, `colleague`, `friend`, `admin`, `unknown`).
    - `contact-resolver.ts`: Constructs canonical `ContactIdentity` from incoming events.
13. **Action Planner & Two-Phase Confirmation Engine (`packages/bot-engine/src/actions/`)**:
    - `action-types.ts`: Action vocabulary (`ANSWER`, `ASK`, `SEARCH`, `OPEN`, `CALCULATE`, `REMEMBER`, `FORGET`, `SCHEDULE`, `SEND`, `UPDATE`, `CREATE`, `DELETE`, `ESCALATE`, `WAIT`, `CONFIRM`).
    - `action-planner.ts`: Parses intents into structured executable action plans.
    - `confirmation.ts`: Two-phase `PLAN → PREVIEW → CONFIRM → EXECUTE` state machine for sensitive actions.
    - `action-validator.ts`: Evaluates action plans against authorization and policy rules.
    - `action-executor.ts`: Safely executes approved actions.
14. **Browser Action Layer & Session Manager (`packages/bot-engine/src/browser/`)**:
    - `domain-policy.ts`: Strictly allowed/blocked domain verification with SSRF and metadata IP blocking.
    - `credential-policy.ts`: Automatic redaction of passwords, tokens, and API keys.
    - `browser-session.ts`: Isolated browser automation execution with timeout safeguards.
15. **Operational Structured Logging & Action Audit (`packages/bot-engine/src/logging/`)**:
    - `structured-logger.ts`: Low-overhead JSON logger with automatic credential and API key redaction.
    - `action-audit.ts`: Audits executed actions, permissions, policy decisions, and results.
16. **Operational Intelligence & Conversation State (`packages/bot-engine/src/operational-intelligence/`)**:
    - `conversation-state.ts`: Structured state tracking active goals, entities, and conversation modes (`CASUAL`, `SUPPORT`, `RESEARCH`, `TASK`, `TRANSACTION`, `EMOTIONAL`, `ROMANTIC`, `ADMIN`, `HUMAN_HANDOFF`).
    - `open-loops.ts`: Tracks multi-turn open workflows across worker turns.
    - `question-decision.ts`: Decides whether to `ANSWER_DIRECTLY`, `ASK_CLARIFICATION`, or `MAKE_BEST_REASONABLE_INTERPRETATION`.
    - `fatigue-engine.ts`: Detects repeated passive affirmations (`ok`, `haan`, `hmm`, `thik`) and lowers initiative without annoying the user.
    - `quiet-hours.ts`: Enforces quiet hours (e.g. 22:00–08:00 local time).

---

## 3. Active Dependencies

- `@bot/shared`: Core shared schemas, Zod validators, and types.
- `@bot/database`: Supabase client, pgvector queries, and transaction helpers.
- `@bot/engine`: Authoritative conversation orchestrator, tools, quality gate, telemetry, web intelligence, skills, personality, authorization, identity, actions, browser, logging, operational intelligence.
- `openai`: Cloud LLM and embeddings client.
- `baileys`: WhatsApp Web Multi-Device socket transport.

---

## 4. Deployment Targets

| Service | Environment | Status | Verification URL |
|---|---|---|---|
| **Render Worker** (`wp9-worker`) | Production 24/7 Web Service | Live (`17bf61c` -> updating) | `https://wp-9.onrender.com/health/ready` |
| **Vercel Control Plane** | Admin Dashboard / UI | Live | `https://daziai-whatsapp-crm.vercel.app` |
| **Railway** | Production Alternative | Configured (`railway.json`) | `/health/live` |
| **Fly.io** | Regional Alternative | Configured (`fly.toml`) | `/health/live` |
| **Supabase** | Managed PostgreSQL + pgvector | Active | Database connection verified healthy |

---

## 5. Test Suite Status

- **Total Tests**: 130 passing across 15 test suites.
- **Pass Rate**: 100%.
- **Multiple Response Rate**: 0.00% (Strictly guaranteed).
- **TypeScript Typecheck**: 0 errors across monorepo (`npm run typecheck`).
- **Production Build**: 0 errors (`npm run build`).

---

## 6. Next Recommended Phase

1. **Multimodal UnifiedMessageContext**:
   - Voice message transcription pipeline (`faster-whisper`), document extraction (`MarkItDown`), and image understanding integrated into the UnifiedMessageContext.
2. **End-to-End Browser Tool Execution**:
   - Playwright / Chromium headless worker support in production Docker container.
