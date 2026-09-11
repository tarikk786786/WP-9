# WP-9 Production Repair Audit (Phase 0)

## 1. Current Deployment Targets
- **Vercel**: Hosts the Next.js frontend (`apps/web`) dashboard and web APIs (`/api/status`, `/api/admin/*`). Vercel does NOT run Baileys or persistent WhatsApp sockets.
- **Render**: Production Docker service (`wp9-worker`) deployed in Singapore (`srv-dai0uiqd0e5s739a0g70`) at `https://wp-9.onrender.com`. Persistent Docker volume at `/app/data` with health check `/health/live`.
- **Railway**: Configured in `railway.json` with Dockerfile builder, `numReplicas: 1`, `restartPolicyType: "ALWAYS"`, healthcheck `/health/live`.
- **Fly.io**: Configured in `fly.toml` for single machine in `iad` region, internal port 8788, healthcheck `/health/live`.
- **Docker Compose**: `docker-compose.yml` defining `worker` (persistent volume `worker-auth:/app/data`) and `web`.

## 2. Current Environment Variables
- `PORT` / `WORKER_PORT`: 8788
- `NODE_ENV`: production
- `HOST`: 0.0.0.0
- `PUBLIC_WORKER_URL`: `https://wp-9.onrender.com`
- `BAILEYS_AUTH_DIR`: `/app/data/baileys-auth`
- `DEPLOYMENT_MODE`: `render`
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key for DB queries and atomic locks
- `SUPABASE_ANON_KEY`: Public client key
- `ADMIN_SECRET`: Admin dashboard auth secret
- `WORKER_API_SECRET`: Worker-to-Web IPC bearer secret
- `GROQ_API_KEY`: Groq Llama3 provider key

## 3. Current Worker Entrypoint
- **Worker Main**: `apps/worker/src/index.ts` starting HTTP server on port 8788.
- **Supervisor**: `apps/worker/src/guard.ts` (monitors worker crash loop and auto-restarts).
- **Socket Lifecycle**: `apps/worker/src/whatsapp.ts` (`startWhatsApp`, `ensureAlwaysOn`).

## 4. Current Inbound Webhook & Event Handlers
- `sock.ev.on("messages.upsert")`: Primary inbound message event.
- `sock.ev.on("messages.update")`: Message ack/read/reaction updates (must never spawn new conversational turns).
- `sock.ev.on("messaging-history.set")`: Chat history sync from phone/web (must never spawn automated replies).

## 5. Current Send Paths & Audit
- `sendText(chatId, text)`: Calls `sock.sendMessage(jid, { text })` directly on socket.
- `conversationEngine.outbox`: Enqueues and serializes outbound message delivery with idempotency on `responseId`.
- **Finding**: Direct calls to `sendText` or `sock.sendMessage` outside `outbox` must be strictly forbidden for all conversational turns.

## 6. Current Database Deduplication & Tables
- `message_dedup`: `message_id UNIQUE`, `event_id UNIQUE`, `content_hash`, `chat_id`, `sender_id`.
- `conversation_turns`: `turn_id UNIQUE`, `chat_id`, `message_ids`, `combined_text`, `status`.
- `response_commits`: `response_id UNIQUE`, `turn_id UNIQUE`, `chat_id`, `status`, `final_text`.
- `conversation_locks`: `chat_id PRIMARY KEY`, `turn_id`, `owner_id`, `expires_at`.
- `message_outbox`: `response_id UNIQUE`, `turn_id`, `chat_id`, `text`, `status`, `attempts`.

## 7. Current Deployment Triggers
- **GitHub Actions**: `.github/workflows/ci.yml` runs on push to `main` and `develop`.
- **Render Autodeploy**: Triggers build from GitHub commit on `main`.
