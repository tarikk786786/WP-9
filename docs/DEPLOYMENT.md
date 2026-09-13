# WP-9 Production Deployment Architecture

## 1. Multi-Target Deployment Matrix

| Target | Component | Hostname / URL | Healthcheck | Persistence |
|---|---|---|---|---|
| **Render** | Production 24/7 Baileys Worker | `https://wp-9.onrender.com` | `GET /health/live` (20s) | Volume `/app/data` + Supabase `baileys_auth` |
| **Vercel** | Web Dashboard & Control Plane | `https://daziai-whatsapp-crm.vercel.app` | `GET /api/health` | Stateless (Supabase DB) |
| **Railway** | Production Alternative Worker | Railway internal / public | `GET /health/live` (100s) | Volume `/app/data` |
| **Fly.io** | Regional Alternative Worker | Fly app URL | `GET /health/live` (20s) | Volume `/app/data` |
| **Supabase** | PostgreSQL + pgvector | Supabase Cloud | Connection ping | Cloud Managed DB |

---

## 2. Worker Startup, Healthchecks & Zero-Downtime Rollouts

The persistent container image is built with:
- Node.js LTS on Debian Bullseye Slim
- System dependencies: `ca-certificates`, `curl`, and `ffmpeg` (for media transcoding & voice notes)
- Monorepo compilation with isolated workspace dependencies

### Health Endpoints
- **`/health/live`**: Reports process liveness, uptime, and memory status.
- **`/health/ready`**: Reports 200 OK only when the WhatsApp Baileys socket is connected and authenticated (`open` phase).
- **`/health`**: Comprehensive JSON report detailing lease status, canonical health state (`HEALTHY`), reconnection counters, and Baileys version (`6.7.24`).

### Distributed Session Lease & Split-Brain Guard
During container redeployments, the outgoing and incoming containers may temporarily overlap:
1. The new container boots up and attempts to acquire the worker lease (`acquireWorkerLease()`).
2. If the previous container is still terminating, the new container enters `standby` mode and refuses to open a conflicting Baileys socket.
3. Upon receiving `SIGTERM`, the retiring container flushes auth to `baileys_auth` and releases its lease (`releaseWorkerLease()`).
4. The new container claims the lease and opens the socket smoothly without session collision.
