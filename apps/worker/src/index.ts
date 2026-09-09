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

const port = Number(process.env.WORKER_PORT || 8788);

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
    if (url.pathname === "/health" || url.pathname === "/worker/health") {
      const snap = getSnapshot();
      json(res, 200, {
        worker: "ok",
        status: snap.connected ? "healthy" : "degraded",
        uptimeMs: uptimeMs(),
        supabase: usingSupabase(),
        whatsappConnection: snap.phase,
        lastSuccessfulConnection: snap.lastConnectedAt,
        lastMessageReceived: snap.lastMessageReceivedAt,
        lastMessageSent: snap.lastMessageSentAt,
        whatsapp: {
          phase: snap.phase,
          connected: snap.connected,
          phone: snap.phone,
          persisted: snap.persisted,
          error: snap.error,
          lastConnectedAt: snap.lastConnectedAt,
          lastMessageReceivedAt: snap.lastMessageReceivedAt,
          lastMessageSentAt: snap.lastMessageSentAt,
        },
      });
      return;
    }
    if (!authorized(req)) {
      unauthorized(res);
      return;
    }
    if (url.pathname === "/status" && req.method === "GET") {
      json(res, 200, {
        health: { worker: "ok", uptimeMs: uptimeMs(), whatsapp: getSnapshot() },
        analytics: analyticsSnapshot(),
        settings: await getSettings(),
      });
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
      void startWhatsApp(pair);
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

server.listen(port, "0.0.0.0", () => {
  console.log(`[worker] Baileys worker on http://127.0.0.1:${port}`);
  void ensureAlwaysOn();
});
