# WP-9 Production System Invariants & Reconciliation

This document formalizes the immutable runtime invariants that safeguard WP-9 against ghost responses, duplicate deliveries, stale message execution, and silent failure.

---

## 1. The 10 Invariants

| ID | Invariant Name | Rule & Formal Constraint | Enforcement Layer |
| :--- | :--- | :--- | :--- |
| **INV-01** | **Single Response Per Turn** | `ONE LOGICAL USER TURN -> AT MOST ONE OUTBOUND RESPONSE`. A turn with status `COMMITTED` or `DELIVERED` must never trigger another generation. | `AuthoritativeConversationEngine`, `SingleFlightLock` |
| **INV-02** | **Single Delivery Per Response** | `ONE RESPONSE_ID -> AT MOST ONE DELIVERY`. An outbox item can only be dispatched once to Baileys socket. | `OutboxDispatcher`, `IdempotencyKey` |
| **INV-03** | **Outbox Exclusive Send Path** | All outbound messages must be committed to the durable outbox table prior to network dispatch. Direct socket emits from controllers or tool hooks are strictly prohibited. | Monorepo Architectural Boundary |
| **INV-04** | **Stale Response Never Delivered** | If incoming user burst increments conversation version while draft response is preparing, the draft is immediately marked `SUPERSEDED` and dropped. | `SupersessionManager`, `VersionCheck` |
| **INV-05** | **History Sync No Live Reply** | Ingested historical messages (`isHistorySync: true` or timestamp > 10m old) are strictly recorded into the database and must never enter the active turn queue. | `IngestFilter` |
| **INV-06** | **Message Update No Live Reply** | WhatsApp protocol messages, receipts, edits, and reaction updates must never spawn conversational turns. | `EventRouter` |
| **INV-07** | **Media Processors Do Not Send Messages** | Media intelligence engines (audio transcriber, OCR, visual descriptor) emit `UnifiedMessageContext` evidence only. Only the ConversationBrain's response planner may emit outbound text. | `MultimodalContextBuilder` |
| **INV-08** | **Single Active Socket Owner** | For a WhatsApp account, exactly one active persistent worker process holds the WebSocket connection at any point in time. | Worker Single-Instance & Lease Lock |
| **INV-09** | **Canonical Message Identity** | Every message must have exactly one canonical deterministic identity (`message_claims` with `message_id`). | `MessageClaimsRegistry` |
| **INV-10** | **Private Memories Cannot Leak to Group Contexts** | Facts or preferences tagged with `scope: 'private'` are strictly pruned from prompt assembly when evaluating a group chat (`isGroup: true`). | `PrivacyScopeGuard` |

---

## 2. Multi-Layer Health Matrix (L0 - L9)

| Layer | System Component | Metric / Health Check | Failure Recovery Action |
| :--- | :--- | :--- | :--- |
| **L0** | Process | Worker process heartbeat, memory consumption | PM2 / Container restart |
| **L1** | Transport | Baileys WebSocket connection state (`open`) | Auto-reconnect with exponential backoff |
| **L2** | Database | Supabase Postgres round-trip query (< 500ms) | Failover pool, retry transient network error |
| **L3** | Queue / Outbox | Pending outbox queue depth & item age | Alert P1 if oldest item > 60s |
| **L4** | AI Providers | Circuit breaker trip state (Groq, OpenAI, Anthropic) | Multi-provider automatic failover |
| **L5** | Media | Quarantine status, MIME vs magic byte validity | Reject spoofed MIME, quarantine infected payloads |
| **L6** | Conversation | Stuck turn claims with expired lease | Auto-release lease and reconcile turn |
| **L7** | Delivery | Delivery failure rate (< 5% over 5m window) | Alert on failure spike, requeue backoff |
| **L8** | Automation | Scheduled task runner heartbeat | Self-healing cron watchdog |
| **L9** | Data Integrity | Anomaly count from periodic `StateReconciler` | Log critical anomaly, block duplicate outbox send |

---

## 3. Reconciliation State Machine

The `StateReconciler` periodically sweeps:
1. **Claims**: Expired leases (`lease_until < now`) without completion are released.
2. **Turns & Responses**: Outbox items are validated against parent turn IDs. Any response lacking an outbox entry is re-enqueued.
3. **Drafts**: Any draft targeting a conversation with a newer user message is purged.
