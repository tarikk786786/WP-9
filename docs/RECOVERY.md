# WP-9 Crash Recovery & Lease Management

## 1. Crash Recovery Protocol
When the persistent worker restarts (due to redeployment, node failure, or container recycling):

1. **Unsent Response Recovery**:
   - Outbox executes `initFromDatabase()`.
   - Any record in `COMMITTED` or `PENDING` state that was not marked `SENT` is loaded and scheduled for delivery.

2. **Expired Claims Recovery**:
   - Records in `inbound_event_claims` with `lease_until < NOW()` and status `CLAIMED` are released for processing.

3. **Stale Chat Lock Clearance**:
   - `conversation_locks` entries past `expires_at` are purged, allowing new messages to acquire locks without deadlocks.

4. **Session Reconnection**:
   - `ConnectionGuardian` checks Baileys authentication state in `BAILEYS_AUTH_DIR`.
   - If local files are unreadable, loads backup snapshot from encrypted database storage.
