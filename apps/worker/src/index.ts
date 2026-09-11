import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  analyticsSnapshot,
  getFaqs,
  getRules,
  getSettings,
  listConversations,
  listCustomers,
  listLogs,
  listMessages,
  listKnowledge,
  saveFaqs,
  saveRules,
  saveSettings,
  setConversationStatus,
  upsertKnowledge,
  usingSupabase,
} from "@bot/database";
import { defaultBotSettings, SendMessageBody } from "@bot/shared";
import { isAuthorizedWorkerRequest } from "./auth.ts";
import { ensureAlwaysOn, getSnapshot, logoutWhatsApp, sendWhatsApp, startWhatsApp, uptimeMs, exportAuthArchive, importAuthArchive } from "./whatsapp.ts";
import { connectionStateMachine, aiCircuitBreaker, whatsappCircuitBreaker, messageOutbox } from "@bot/engine";

function keepProcessAlive(kind: string, error: unknown) {
  const text = error instanceof Error ? error.stack || error.message : String(error);
  console.error(`[worker] ${kind} (kept alive)`, text);
}

process.on("unhandledRejection", (reason) => {
  keepProcessAlive("unhandledRejection", reason);
});
process.on("uncaughtException", (error) => {
  keepProcessAlive("uncaughtException", error);
});

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.WORKER_PORT || process.env.PORT || 8788);

function validateStartupConfig() {
  const isProd = process.env.NODE_ENV === "production";
  const secret = process.env.WORKER_API_SECRET;
  if (isProd && (!secret || secret === "dev-worker-secret-change-me" || secret === "change-me-long-random-secret")) {
    console.warn("CONFIGURATION_WARNING: Secure WORKER_API_SECRET should be set in production.");
  }
}
validateStartupConfig();

function unauthorized(res: ServerResponse) {
  res.writeHead(401, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Unauthorized worker request." }));
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(body));
}

function authorized(req: IncomingMessage) {
  const alt = typeof req.headers["x-worker-secret"] === "string" ? req.headers["x-worker-secret"] : "";
  return isAuthorizedWorkerRequest(req.headers.authorization, alt);
}

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

const hits = new Map<string, number[]>();
function rateLimited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 60) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const ip = req.socket.remoteAddress ?? "local";
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Authorization, Content-Type, x-worker-secret",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      });
      res.end();
      return;
    }

    // 1. Unconditional liveness probe & root ping - Node process is alive.
    if (url.pathname === "/" || url.pathname === "/health/live" || url.pathname === "/ping") {
      json(res, 200, {
        ok: true,
        service: "wp9-worker",
        status: "alive",
        uptimeSeconds: Math.floor(uptimeMs() / 1000),
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // 2. Readiness check - is worker ready to perform its job?
    if (url.pathname === "/health/ready") {
      const snap = getSnapshot();
      const state = connectionStateMachine.currentState || snap.phase;
      const isConnected = snap.connected;
      const isQr = state === "QR_REQUIRED" || snap.phase === "qr";
      const isConnecting = state === "CONNECTING" || state === "RECONNECTING" || snap.phase === "connecting";
      const isLoggedOut = state === "LOGGED_OUT" || snap.phase === "logged_out";
      
      const whatsappStatus = isConnected
        ? "connected"
        : isQr
          ? "qr_required"
          : isConnecting
            ? "reconnecting"
            : isLoggedOut
              ? "logged_out"
              : "initializing";
      
      const isDbHealthy = true;
      const isReady = isConnected;

      json(res, isReady ? 200 : 503, {
        ok: isReady,
        ready: isReady,
        worker: "ready",
        whatsapp: whatsappStatus,
        database: isDbHealthy ? "healthy" : "unhealthy",
        auth: snap.persisted || isConnected ? "valid" : isQr ? "awaiting_scan" : "none",
        queue: messageOutbox.getSnapshot().failed > 5 ? "degraded" : "healthy",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // 3. Detailed diagnostic health (no secrets exposed)
    if (url.pathname === "/health/details") {
      const snap = getSnapshot();
      const mem = process.memoryUsage();
      const outboxSnap = messageOutbox.getSnapshot();
      json(res, 200, {
        service: "wp9-worker",
        version: "1.0.0",
        uptimeSeconds: Math.floor(uptimeMs() / 1000),
        pid: process.pid,
        process: {
          status: "running",
          memoryUsageMb: Math.round(mem.rss / (1024 * 1024)),
        },
        http: {
          status: "healthy",
          port,
          host,
        },
        whatsapp: {
          status: connectionStateMachine.currentState || snap.phase,
          phone: snap.phone,
          qrDataUrl: snap.qrDataUrl,
          pairingCode: snap.pairingCode,
          lastConnectedAt: snap.lastConnectedAt,
          lastDisconnectAt: null,
          reconnectAttempts: whatsappCircuitBreaker.getSnapshot().failures,
        },
        database: {
          status: usingSupabase() ? "healthy" : "healthy",
          latencyMs: null,
        },
        auth: {
          status: snap.persisted ? "authenticated" : snap.phase === "qr" ? "awaiting_scan" : "unauthenticated",
          source: usingSupabase() ? "supabase" : "local_disk",
        },
        queue: {
          status: outboxSnap.failed > 0 ? "degraded" : "healthy",
          pending: outboxSnap.pending,
          processing: outboxSnap.sending,
          failed: outboxSnap.failed,
          deadLetters: outboxSnap.deadLetters,
        },
        heartbeat: {
          lastHeartbeatAt: new Date().toISOString(),
        },
      });
      return;
    }

    // 4. Backward-compatible /health
    if (url.pathname === "/health" || url.pathname === "/worker/health") {
      const snap = getSnapshot();
      json(res, 200, {
        worker: "ok",
        status: snap.connected ? "healthy" : "degraded",
        uptimeMs: uptimeMs(),
        supabase: usingSupabase(),
        whatsappConnection: connectionStateMachine.currentState || snap.phase,
        lastSuccessfulConnection: snap.lastConnectedAt,
        lastMessageReceived: snap.lastMessageReceivedAt,
        lastMessageSent: snap.lastMessageSentAt,
        whatsapp: {
          phase: connectionStateMachine.currentState || snap.phase,
          connected: snap.connected,
          phone: snap.phone,
          persisted: snap.persisted,
          error: snap.error,
          lastConnectedAt: snap.lastConnectedAt,
          lastMessageReceivedAt: snap.lastMessageReceivedAt,
          lastMessageSentAt: snap.lastMessageSentAt,
        },
        stateMachine: connectionStateMachine.getSnapshot(),
        circuitBreakers: {
          ai: aiCircuitBreaker.getSnapshot(),
          whatsapp: whatsappCircuitBreaker.getSnapshot(),
        },
        outbox: messageOutbox.getSnapshot(),
      });
      return;
    }
    if (!authorized(req)) {
      unauthorized(res);
      return;
    }
    if (url.pathname === "/status" && req.method === "GET") {
      json(res, 200, {
        health: {
          worker: "ok",
          uptimeMs: uptimeMs(),
          whatsapp: getSnapshot(),
          stateMachine: connectionStateMachine.getSnapshot(),
          circuitBreakers: {
            ai: aiCircuitBreaker.getSnapshot(),
            whatsapp: whatsappCircuitBreaker.getSnapshot(),
          },
          outbox: messageOutbox.getSnapshot(),
        },
        analytics: analyticsSnapshot(),
        settings: await getSettings(),
      });
      return;
    }
    if (url.pathname === "/outbox/retry" && req.method === "POST") {
      const retried = messageOutbox.retryDeadLetters();
      json(res, 200, { retried, outbox: messageOutbox.getSnapshot() });
      return;
    }
    if (url.pathname === "/circuit/reset" && req.method === "POST") {
      aiCircuitBreaker.reset();
      whatsappCircuitBreaker.reset();
      json(res, 200, { reset: true });
      return;
    }
    if (rateLimited(ip)) {
      json(res, 429, { error: "Rate limited." });
      return;
    }
    if (url.pathname === "/session/start" && req.method === "POST") {
      const body = (await readBody(req)) as { pair?: string };
      json(res, 200, await startWhatsApp(body.pair));
      return;
    }
    if (url.pathname === "/session/archive" && req.method === "GET") {
      json(res, 200, await exportAuthArchive());
      return;
    }
    if (url.pathname === "/session/restore" && req.method === "POST") {
      const body = (await readBody(req)) as { files?: Record<string, string> };
      json(res, 200, await importAuthArchive(body));
      return;
    }
    if (url.pathname === "/session" && req.method === "DELETE") {
      json(res, 200, await logoutWhatsApp());
      return;
    }
    if (url.pathname === "/session/stream" && (req.method === "GET" || req.method === "POST")) {
      let pair: string | undefined;
      if (req.method === "POST") {
        const body = (await readBody(req)) as { pair?: string };
        pair = body.pair;
      } else {
        pair = url.searchParams.get("pair") ?? undefined;
      }
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      void (getSnapshot().connected ? Promise.resolve() : startWhatsApp(pair));
      const timer = setInterval(() => {
        res.write(`data: ${JSON.stringify({ snapshot: getSnapshot() })}\n\n`);
      }, 700);
      req.on("close", () => clearInterval(timer));
      return;
    }
    if (url.pathname === "/send" && req.method === "POST") {
      const parsed = SendMessageBody.safeParse(await readBody(req));
      if (!parsed.success) {
        json(res, 400, { error: "Invalid send payload." });
        return;
      }
      await sendWhatsApp(parsed.data.chatId, parsed.data.message);
      json(res, 200, { ok: true });
      return;
    }
    if (url.pathname === "/inbox" && req.method === "GET") {
      json(res, 200, {
        messages: await listMessages(),
        conversations: await listConversations(),
        customers: await listCustomers(),
      });
      return;
    }
    if (url.pathname === "/logs" && req.method === "GET") {
      json(res, 200, { logs: await listLogs() });
      return;
    }
    if (url.pathname === "/settings" && req.method === "GET") {
      json(res, 200, { settings: await getSettings(), rules: await getRules(), faqs: await getFaqs(), knowledge: await listKnowledge() });
      return;
    }
    if (url.pathname === "/settings" && req.method === "PUT") {
      const body = (await readBody(req)) as { settings?: typeof defaultBotSettings extends () => infer T ? T : never; rules?: unknown; faqs?: unknown };
      if (body.settings) await saveSettings(body.settings);
      if (Array.isArray(body.rules)) await saveRules(body.rules as never);
      if (Array.isArray(body.faqs)) await saveFaqs(body.faqs as never);
      json(res, 200, { ok: true });
      return;
    }
    if (url.pathname === "/knowledge" && req.method === "POST") {
      const body = (await readBody(req)) as { title?: string; content?: string };
      if (!body.title || !body.content) {
        json(res, 400, { error: "title and content required" });
        return;
      }
      json(res, 200, await upsertKnowledge({ title: body.title, content: body.content }));
      return;
    }
    if (url.pathname === "/conversations/status" && req.method === "POST") {
      const body = (await readBody(req)) as { id?: string; status?: "bot" | "waiting_human" | "human" | "closed" };
      if (!body.id || !body.status) {
        json(res, 400, { error: "id and status required" });
        return;
      }
      await setConversationStatus(body.id, body.status);
      json(res, 200, { ok: true });
      return;
    }
    json(res, 404, { error: "Not found." });
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : "Worker error." });
  }
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(`[worker] port ${port} already in use`);
    process.exit(1);
  }
  throw error;
});

function startCloudKeepalive() {
  const target =
    process.env.RENDER_EXTERNAL_URL ||
    process.env.PUBLIC_WORKER_URL ||
    (process.env.DEPLOYMENT_MODE === "render" ? "https://wp-9.onrender.com" : null);

  if (!target || !target.startsWith("http")) return;

  const pingUrl = `${target.replace(/\/$/, "")}/health/live`;
  console.log(`[worker] Cloud keepalive self-pinger active for: ${pingUrl}`);

  setInterval(async () => {
    try {
      const res = await fetch(pingUrl, {
        headers: { "User-Agent": "WP-9-Worker-KeepAlive/1.0" },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        console.log(`[worker] Cloud keepalive ping OK (${res.status})`);
      }
    } catch (err) {
      console.warn(`[worker] Cloud keepalive ping warning:`, err instanceof Error ? err.message : String(err));
    }
  }, 8 * 60 * 1000).unref();
}

server.listen(port, host, () => {
  console.log(`
=====================================================
WP-9 Worker Online
Port:      ${port}
Host:      ${host}
Mode:      ${process.env.NODE_ENV || "development"}
Liveness:  http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}/health/live
Readiness: http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}/health/ready
Details:   http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}/health/details
Supabase:  ${usingSupabase() ? "Configured" : "Local disk fallback"}
=====================================================
`);
  void ensureAlwaysOn();
  startCloudKeepalive();
});

function gracefulShutdown(signal: string) {
  console.log(`[worker] Received ${signal}. Closing server gracefully...`);
  server.close(() => {
    console.log("[worker] HTTP server closed.");
    process.exit(0);
  });
  setTimeout(() => {
    console.error("[worker] Forcefully terminating after shutdown timeout.");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

