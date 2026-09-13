# WP-9 Production Operations Guide

## 1. Core Health & Observability Endpoints

The WhatsApp worker exposes canonical health and observability routes:

- **`GET /health/live`**: Fast L0 container liveness check. Returns `{ status: "ok", uptime: number }`.
- **`GET /health/ready`**: L1 transport readiness check. Returns 200 OK only if WhatsApp socket is in `open` phase, or 503 if connecting/logged out.
- **`GET /health`**: Enriched canonical system health snapshot, including:
  - `canonicalState`: `HEALTHY`, `CONNECTING`, `RECONNECTING`, `DEGRADED`, `AUTH_REQUIRED`, `RESET_REQUIRED`, `FAILED`
  - `connected`: boolean
  - `socketOwner`: worker instance ID holding the distributed lease
  - `leaseExpiry`: ISO timestamp of the current worker lease
  - `lastConnectedAt`, `lastDisconnectedAt`, `disconnectReason`, `reconnectCount`
  - `baileysVersion`: pinned engine version (6.7.24)
- **`GET /status`**: Detailed operational telemetry including circuit breaker statuses, outbox pending counts, and memory consumption.

All endpoints support optional bearer authentication via `WORKER_SECRET`.

---

## 2. Distributed Session Ownership & Split-Brain Prevention

To ensure that only one worker instance connects to WhatsApp at any given time:
- An atomic distributed lease is acquired (`acquireWorkerLease(WORKER_INSTANCE_ID, 30_000)`) in `worker_leases` table before opening a WebSocket.
- If an instance cannot acquire the lease because another live instance holds it, it transitions to `phase: "standby"` and periodically retries.
- On graceful termination (`SIGTERM`, `SIGINT`), the running instance stops `connectionGuardian`, persists auth tokens to `baileys_auth`, and calls `releaseWorkerLease()`.
- If an instance dies ungracefully, the lease automatically expires after 30 seconds, allowing the standby or replacement container to safely claim ownership.

---

## 3. Emergency Controls & Kill Switches

WP-9 provides granular kill switches configurable via `BotSettings` in database or worker API:

1. **Master Bot Kill Switch (`enabled: false`)**:
   - Immediately stops all bot responses across all chats.
2. **Message Processing Kill Switch (`messageProcessingEnabled: false`)**:
   - Emergency freeze that halts turn pipeline execution and drops incoming conversational generation immediately.
3. **Outbound Send Kill Switch (`outboundSendEnabled: false`)**:
   - Freezes the outbox dispatcher, preventing any message from reaching the WhatsApp WebSocket while retaining incoming context.
4. **Group Silence (`replyToGroups: false`)**:
   - Prevents bot from participating in group chats while continuing 1-on-1 customer conversations.

---

## 4. Disappearing Messages Protocol Compliance

When a user enables disappearing messages in WhatsApp:
- WP-9 detects `ephemeralMessage` and captures `contextInfo.expiration`.
- The duration is cached in `chatEphemeralExpiration`.
- All replies to that chat are automatically encapsulated in `ephemeralMessage` with matching expiration in `contextInfo`, preventing decryption drops or protocol violations.

---

## 5. Secret Redaction & Logging Standards

- All worker logs automatically redact sensitive phone numbers, API keys, tokens, and Baileys crypto keys.
- Never set log level to `trace` in production environments.
- Auth directory contents (`/tmp/baileys_auth`) are never committed to version control and are backed up encrypted to the `baileys_auth` Supabase table.
