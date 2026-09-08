# Architecture

See the root README for the full operator guide.

- **Web (`apps/web`)** — Next.js on Vercel: admin, simulator, `/api/health`, `/api/worker/*`.
- **Worker (`apps/worker`)** — Baileys socket, message pipeline, `/worker/health`.
- **Bot engine** — normalized messages only; never Baileys event shapes.
- **Database** — Supabase PostgreSQL with in-memory fallback for local/CI.
