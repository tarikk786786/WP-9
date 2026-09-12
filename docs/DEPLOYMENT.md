# WP-9 Production Deployment Architecture

## 1. Multi-Target Deployment Matrix

| Target | Component | Hostname / URL | Healthcheck | Persistence |
|---|---|---|---|---|
| **Render** | Production 24/7 Baileys Worker | `https://wp-9.onrender.com` | `GET /health/live` (20s) | Volume `/app/data` |
| **Vercel** | Web Dashboard & Control Plane | `https://daziai-whatsapp-crm.vercel.app` | `GET /api/health` | Stateless (Supabase DB) |
| **Railway** | Production Alternative Worker | Railway internal / public | `GET /health/live` (100s) | Volume `/app/data` |
| **Fly.io** | Regional Alternative Worker | Fly app URL | `GET /health/live` (20s) | Volume `/app/data` |
| **Supabase** | PostgreSQL + pgvector | Supabase Cloud | Connection ping | Cloud Managed DB |

## 2. Worker Startup & Healthchecks
- Exposes:
  - `/health/live`: Reports process liveness, uptime, and memory status.
  - `/health/ready`: Reports actual readiness of WhatsApp socket, Supabase database, authentication tokens, and outbox queue.
