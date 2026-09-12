# WP-9 Conversation Engine Architecture

## 1. Architectural Mission & Invariants

WP-9 is an authoritative Conversation Operating System for WhatsApp. It enforces strict invariants:

1. **One Logical Turn = Zero or One Outbound Response**: A conversational turn never produces multiple replies.
2. **No Dropped Valid Turns**: Inbound messages are tracked via transactional claims and recoverable leases.
3. **No Duplicate Event Generation**: Upserts, retries, and updates never spawn duplicate turns.
4. **Internal Components Do Not Send**: AI models, tools, fallbacks, and rules only generate internal candidates.
5. **Authoritative Response Commit**: Only the `ResponseCommit` + `WhatsAppOutbox` pipeline transmits messages.

---

## 2. End-to-End Pipeline

```text
WHATSAPP (Baileys Transport)
       │
       ▼
   EVENT GATE
       │
       ▼
 ATOMIC CLAIM (inbound_event_claims: CLAIMED, lease: 60s)
       │
       ▼
  TURN BUILDER (Debounce: 350ms general / 300ms DAZY, max 2000ms)
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

## 3. Component Details

- **EventGate**: Filters live messages (`messages.upsert` with `type === 'notify'`). Strictly rejects message updates (`messages.update`), history sync (`messaging-history.set`), status broadcasts, and stale/clock-skewed frames.
- **TurnBuilder**: Gathers rapid user fragments into a single coherent turn before triggering generation.
- **ConversationLockManager**: Prevents concurrent generation races for the same chat across workers.
- **UnderstandingEngine**: Performs multilingual parsing, intent discovery, emotion scoring, and entity extraction.
- **DecisionEngine**: Authoritatively decides whether the turn requires an automated reply, human escalation, or silent acknowledgment (`NO_REPLY`).
- **ResponseCommitManager**: Atomically writes the finalized text to `response_commits` with unique constraints.
- **WhatsAppOutbox**: Guarantees delivery with exponential backoff.
