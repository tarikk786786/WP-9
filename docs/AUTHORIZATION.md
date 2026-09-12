# WP-9 Centralized Authorization & Policy Engine

## 1. Overview & Separation of Concerns

WP-9 implements a dual-layer authorization architecture:

```text
Conversation Brain / Action Planner
           │
           ▼
[RELATIONSHIP PERMISSION CHECK] (OpenFGA Model)
  - Who is the subject? (admin, special_contact, customer, ai_agent)
  - What resource is targeted? (chat, message, customer, tool, memory)
  - What permission level is required? (read, execute, write, delete, admin)
           │
         ALLOW
           ▼
[POLICY ENGINE] (OPA Model)
  - Under what operational conditions is this action permitted?
  - Is bot enabled? Is chat in human handoff?
  - Are we in quiet hours? Has rate limit been reached?
  - Does the sensitive action have user confirmation?
           │
         ALLOW
           ▼
[SAFE ACTION EXECUTOR]
```

## 2. Invariant Rule
**The model is forbidden from deciding its own permissions.**
The model proposes an action intent; the deterministic authorization and policy layers decide whether it is permitted to execute.

## 3. High-Risk Confirmation Protocol
Sensitive operations (`send_document`, `delete_conversation`, `update_settings`, `run_browser_action`) require explicit human confirmation (`PLAN` &rarr; `PREVIEW` &rarr; `CONFIRM` &rarr; `EXECUTE`) before execution.
