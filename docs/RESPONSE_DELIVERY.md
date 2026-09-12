# WP-9 Response Delivery & Outbox State Machine

## 1. Single Outbound Delivery Guarantee
Every user turn maps strictly to zero or one response:
- **`response_commits` Table**:
  - `turn_id` has a strict `UNIQUE` database constraint.
  - `response_id` has a strict `UNIQUE` database constraint.
  - Attempting to commit a second response for an existing turn fails atomically.

## 2. Transactional Outbox States
```text
[COMMITTED]
    │
    ▼
[PENDING] ──(Pickup by Outbox Worker)──► [SENDING]
                                            │
               ┌────────────────────────────┴───────────────────────────┐
               ▼                                                        ▼
            [SENT]                                              [RETRYABLE / FAILED]
      (Message dispatched)                                  (Exponential backoff retry)
                                                            *Exact same response record*
```

## 3. Delivery Retries
- If transport times out or fails, the outbox worker retries delivery of the **exact same response record**.
- AI models are never re-invoked to generate an alternate answer.
