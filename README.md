# WhatsApp auto-reply bot

Personal WhatsApp auto-reply without the Meta Cloud API. A **persistent Node worker** keeps a [Baileys](https://github.com/WhiskeySockets/Baileys) WhatsApp Web socket alive. **Vercel** hosts the Next.js admin dashboard only. **Supabase** stores customers, conversations, messages, FAQs, rules, settings, knowledge, logs, and Baileys session files.

Do not run Baileys inside a Vercel Serverless Function. The socket needs a process that stays up.

```
WhatsApp  →  Baileys worker  →  bot engine  →  WhatsApp
                    ↕
                Supabase
                    ↕
         Vercel Next.js admin
```

## Architecture

| Piece | Role |
| --- | --- |
| `apps/web` | Next.js App Router dashboard on Vercel |
| `apps/worker` | Long-running Baileys process (Railway, Render, Fly, VPS, Docker) |
| `packages/bot-engine` | Normalize → dedupe → route (commands, handoff, hours, rules, FAQ, knowledge, AI, fallback) |
| `packages/database` | Supabase or in-memory store |
| `packages/shared` | Zod types |
| `supabase/migrations` | Postgres schema + pgvector |

Vercel talks to the worker with `WORKER_API_URL` and `WORKER_API_SECRET` (server-side only). The browser never sees the worker secret.

## Baileys and WhatsApp authentication

1. Start the worker (`npm run worker`).
2. Open `/admin/dashboard` → Show QR, or pairing code with country-code phone.
3. On the phone: **Linked devices → Link a device**.
4. On `connection.open`, session files are written to `data/baileys-auth` and copied into Supabase `baileys_auth`.
5. Worker restart / deploy / machine reboot hydrates those files. You should not need a new QR unless WhatsApp logged the device out (`401` / `loggedOut` / `badSession`).

Reconnect uses exponential backoff (capped). Logged-out sessions are wiped and a fresh QR is requested.

## Local setup

```bash
npm install
cp .env.example .env
# fill ADMIN_SECRET and WORKER_API_SECRET
npm run dev:worker   # :8788
npm run dev:web      # :43217
```

Or `docker compose up`.

Open http://127.0.0.1:43217 (overview), `/admin` (desk), `/desk` (Hinglish simulator). Default local secrets are in `.env.example` comments — change them.

Without Supabase, state lives in worker memory plus the local `data/` directory. Sessions survive worker restarts only if `data/baileys-auth` is on a persistent volume.

## Supabase setup

1. Create a project.
2. Run `supabase/migrations/0001_init.sql` then `supabase/seed.sql` in the SQL editor.
3. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on the **worker** (and optionally the web app).
4. Keep the service role key off the client.

pgvector is enabled for optional RAG embeddings (`knowledge_documents.embedding`). Similarity search currently falls back to keyword match unless you add embedding jobs.

## AI setup

Hybrid router (`AI_POLICY=hybrid`): greetings/thanks stay off-model; Groq/Gemini/other cheap models handle ordinary chat; GPT-4o/Claude only on hard leads. Set `GROQ_API_KEY` on the **worker** and Vercel. Optional: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`. If every cloud key fails, the engine still answers from facts and fallback copy. It will not invent prices.

## Worker setup (required in production)

Host `apps/worker` as a **persistent** Node process:

- **Docker:** `docker build -t wa-worker . && docker run -p 8788:8788 --env-file .env -v wa-data:/app/data wa-worker`
- **Railway / Render / Fly:** start command `npm run worker`, attach a volume at `/app/data`
- **VPS:** `npm run worker` under systemd

Protect `WORKER_API_SECRET`. Do not expose the Baileys socket. Only the HTTP API (`/health` public, everything else authenticated) should be reachable, preferably on a private network.

Health: `GET /worker/health` (also `/health`).

## Vercel setup

Deploy **`apps/web` only**.

Suggested Vercel settings:

- Root Directory: `apps/web`
- Include files outside the root (npm workspaces)
- Env: `WORKER_API_URL`, `WORKER_API_SECRET`, `ADMIN_SECRET`, `NEXT_PUBLIC_APP_URL`

Do not add Baileys as a Vercel function.

## GitHub setup

Branches: `main`, `develop`, `feature/*`, `fix/*`, `hotfix/*`.

CI (`.github/workflows/ci.yml`) runs `npm install`, lint, typecheck, test, build. Secrets belong in GitHub Secrets, never in the repo.

## Environment variables

See `.env.example`. Never commit `.env`. Never log secrets. Sentry is optional (`SENTRY_DSN`).

## Deployment checklist

- [ ] Worker process is always on, with a persistent volume
- [ ] Supabase migration applied
- [ ] `WORKER_API_SECRET` matches on Vercel and the worker
- [ ] Admin secret set; dashboard not public without it
- [ ] OpenAI key only on the worker
- [ ] WhatsApp linked once; session files in Supabase
- [ ] After deploy, worker hydrates session without a new QR
- [ ] `/api/health` shows web ok; worker health shows WhatsApp phase

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| QR never appears on Vercel | Worker is down or `WORKER_API_URL` is wrong |
| Scan then immediate logout | WhatsApp rejected the session; worker wipes auth and issues a new QR |
| Duplicate replies | Duplicate protection uses `whatsapp_message_id`; check unique constraint |
| Human asked but bot still replies | Set conversation status to `human` in admin |
| AI invents facts | Disable AI or add FAQs / knowledge; fallback is used when the model is unsure |
| Session lost on restart | No volume and no Supabase `baileys_auth` |

## Security

- Worker APIs require `Authorization: Bearer` or `x-worker-secret`
- Admin dashboard uses `ADMIN_SECRET` httpOnly cookie
- Rate limits on login, send, and admin writes
- Zod validation on send payloads
- Meta Cloud webhook routes return 410 by design

## Session persistence

Order of truth: WhatsApp → Baileys multi-file auth in `data/baileys-auth` → base64 rows in `baileys_auth`. The worker hydrates the directory before `useMultiFileAuthState`. `creds.update` is debounced so writes do not race.

## Production checklist

1. Persistent worker host + volume  
2. Supabase service role on worker  
3. Vercel web only  
4. Matching API secrets  
5. Bot enabled in settings  
6. Business hours / FAQs / rules reviewed  
7. CI green  
8. No secrets in git  

## Scripts

```bash
npm run dev          # worker + web
npm run dev:web
npm run dev:worker
npm run worker
npm run lint
npm run typecheck
npm test
npm run build
```

CI tests mock Baileys (no real WhatsApp account).
