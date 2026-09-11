import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import pino from "pino";
import QRCode from "qrcode";
import {
  addLog,
  addMessage,
  clearAuthFiles,
  getFaqs,
  getRules,
  getSettings,
  knowledgeSearch,
  loadAuthFiles,
  recentMessages,
  saveAuthFiles,
  saveSettings,
  saveWorkerHeartbeat,
  acquireWorkerLease,
  releaseWorkerLease,
  setConversationStatus,
  upsertConversation,
  upsertCustomer,
  wasProcessed,
  markProcessed,
  claimInboundMessage,
} from "@bot/database";
import type { NormalizedMessage } from "@bot/shared";
import {
  analyzeMessage,
  combineBurstText,
  debounceChat,
  generateBestHumanReply,
  isCannedFallback,
  isDuplicate,
  isInboundStub,
  matchAllFaqs,
  matchAllRules,
  normalizeIncoming,
  routeMessage,
  writeCompleteFallback,
  writeSpokenReply,
  avoidRepeat,
  connectionStateMachine,
  aiCircuitBreaker,
  whatsappCircuitBreaker,
  messageOutbox,
  conversationEngine,
} from "@bot/engine";
import { shouldReplyTool } from "@bot/engine/tools";
import { personForChat } from "./people-map.ts";
import { isSendableJid, resolveChat } from "./chat-address.ts";
import { authDir, migrateLegacyAuth } from "./paths.ts";
import { credsAreLinked, phoneFromCreds, shouldWipeAuth } from "./session-policy.ts";
import { connectionGuardian } from "./connection-guardian.ts";

type ScanPhase = "idle" | "qr" | "connecting" | "ready" | "logged_out";

export type WorkerSnapshot = {
  phase: ScanPhase;
  connected: boolean;
  phone: string | null;
  qrDataUrl: string | null;
  pairingCode: string | null;
  persisted: boolean;
  error: string | null;
  lastConnectedAt: string | null;
  lastMessageReceivedAt: string | null;
  lastMessageSentAt: string | null;
};

const AUTH_DIR = authDir();
const startedAt = Date.now();

const inboundStore = new Map<string, Record<string, unknown>>();

async function withTimeout<T>(task: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    task
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(null);
      });
  });
}

async function sendText(jid: string, text: string) {
  const sock = manager.sock;
  if (!sock) throw new Error("WhatsApp socket down");
  if (!isSendableJid(jid)) throw new Error("WhatsApp chat id missing");
  await sock.sendMessage(jid, { text });
  manager.snapshot.lastMessageSentAt = new Date().toISOString();
  touchFrame();
}

// Authoritative Single-Turn Conversation Engine Setup
conversationEngine.setSender(async (chatId, text) => {
  await sendText(chatId, text);
});

conversationEngine.setAiGenerator(async (context, tier) => {
  const { turn, history, knowledge, faqs, rules, understanding } = context;
  const settings = await getSettings();
  const person = personForChat(turn.chatId, turn.fromName, turn.sender);

  const faqFacts = matchAllFaqs(turn.combinedText, faqs).map((f) => `${f.question}: ${f.answer}`);
  const ruleFacts = matchAllRules(turn.combinedText, rules)
    .filter((r) => !/agent|human/.test(r.triggerValue))
    .map((r) => r.response);

  const timeoutMs = tier === "fast" ? 6500 : 5000;
  const ai = await withTimeout(
    generateBestHumanReply(
      {
        id: turn.firstMessageId,
        whatsappMessageId: turn.firstMessageId,
        chatId: turn.chatId,
        sender: turn.sender,
        fromName: person?.name ?? turn.fromName ?? turn.sender,
        text: turn.combinedText,
        timestamp: new Date(turn.createdAt).toISOString(),
        isGroup: turn.isGroup,
        type: "text",
        metadata: {},
      },
      {
        settings,
        customerName: person?.name ?? turn.fromName ?? turn.sender,
        recent: history,
        faqs: [...faqFacts, ...faqs.map((f) => `${f.question}: ${f.answer}`)],
        knowledge: [...knowledge, ...ruleFacts],
        intent: understanding.intents.join(","),
        analysis: analyzeMessage(turn.combinedText, {
          isFirstMessage: history.length === 0,
          inboundCount: history.filter((m) => m.role === "user").length,
        }),
        isFirstMessage: history.length === 0,
        messageType: "text",
        person: person ?? undefined,
      }
    ),
    timeoutMs
  );

  return ai?.text ? { text: ai.text, modelId: tier === "fast" ? "gpt-4o-mini" : "gpt-4o" } : null;
});

conversationEngine.updateDependencies({
  getSettings: async () => {
    return await getSettings();
  },
  getConversationStatus: async (chatId: string) => {
    const customer = await upsertCustomer({
      number: chatId.replace(/@s\.whatsapp\.net$/, "").replace(/@lid$/, ""),
      name: chatId,
    });
    const convo = await upsertConversation(customer.id, chatId);
    return convo.status;
  },
  setConversationStatus: async (chatId: string, status: string) => {
    const customer = await upsertCustomer({
      number: chatId.replace(/@s\.whatsapp\.net$/, "").replace(/@lid$/, ""),
      name: chatId,
    });
    const convo = await upsertConversation(customer.id, chatId);
    await setConversationStatus(convo.id, status as never);
  },
  getHistory: async (chatId: string) => {
    const customer = await upsertCustomer({
      number: chatId.replace(/@s\.whatsapp\.net$/, "").replace(/@lid$/, ""),
      name: chatId,
    });
    const convo = await upsertConversation(customer.id, chatId);
    const history = await recentMessages(convo.id);
    return history
      .slice()
      .reverse()
      .map((m) => ({
        role: m.direction === "in" ? ("user" as const) : ("assistant" as const),
        text: m.text,
      }));
  },
  searchKnowledge: async (query: string) => {
    return await knowledgeSearch(query);
  },
  getFaqs: async () => {
    return await getFaqs();
  },
  getRules: async () => {
    return await getRules();
  },
  onMessageCommitted: async (chatId, message, turn) => {
    const customer = await upsertCustomer({
      number: chatId.replace(/@s\.whatsapp\.net$/, "").replace(/@lid$/, ""),
      name: chatId,
    });
    const convo = await upsertConversation(customer.id, chatId);
    await addMessage({
      conversation_id: convo.id,
      whatsapp_message_id: message.responseId,
      direction: "out",
      message_type: "text",
      text: message.text,
      media_reference: null,
      ai_generated: Boolean(message.modelId),
      intent: message.intent,
    });
    await markProcessed(message.responseId);
    await markProcessed(message.turnId);
    await markProcessed(`out_${message.turnId}`);
    if (turn?.messageIds) {
      for (const mid of turn.messageIds) {
        await markProcessed(mid);
        await markProcessed(`out_${mid}`);
      }
    }
  },
});

type Manager = {
  snapshot: WorkerSnapshot;
  sock: import("@whiskeysockets/baileys").WASocket | null;
  starting: boolean;
  generation: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectDelay: number;
};

const empty = (): WorkerSnapshot => ({
  phase: "idle",
  connected: false,
  phone: null,
  qrDataUrl: null,
  pairingCode: null,
  persisted: false,
  error: null,
  lastConnectedAt: null,
  lastMessageReceivedAt: null,
  lastMessageSentAt: null,
});

const manager: Manager = {
  snapshot: empty(),
  sock: null,
  starting: false,
  generation: 0,
  reconnectTimer: null,
  reconnectDelay: 1500,
};

let lastFrameAt = Date.now();
function touchFrame() {
  lastFrameAt = Date.now();
  connectionGuardian.recordActivity();
}

function isSocketLive() {
  const sock = manager.sock as { user?: { id?: string }; ws?: { readyState?: number } } | null;
  if (!sock?.user) return false;
  if (typeof sock.ws?.readyState === "number" && sock.ws.readyState !== 1) return false;
  return manager.snapshot.phase === "ready" || manager.snapshot.connected === true;
}

const STALE_MS = 90_000;

function isSocketReallyLive() {
  return isSocketLive() && Date.now() - lastFrameAt < STALE_MS;
}

export function getSnapshot(): WorkerSnapshot {
  const snap = manager.snapshot;
  if (isSocketReallyLive()) {
    return { ...snap, phase: "ready", connected: true, error: null };
  }
  if (isSocketLive() && Date.now() - lastFrameAt >= STALE_MS) {
    return {
      ...snap,
      phase: "connecting",
      connected: false,
      error: "WhatsApp connection went silent. Reconnecting...",
    };
  }
  if (snap.phase === "qr" && snap.qrDataUrl) return { ...snap, connected: false };
  if (manager.starting) return { ...snap, phase: "connecting", connected: false };
  return {
    ...snap,
    connected: false,
    phase: snap.persisted ? "connecting" : snap.phase === "logged_out" ? "logged_out" : snap.phase,
  };
}

export const WORKER_INSTANCE_ID = `worker_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;

export async function syncWorkerHeartbeat() {
  try {
    const snap = getSnapshot();
    let tunnelUrl = process.env.PUBLIC_WORKER_URL?.trim() || null;
    if (!tunnelUrl) {
      const candidates = [
        path.resolve(process.cwd(), "tools", "tunnel-url.txt"),
        path.resolve(process.cwd(), "..", "..", "tools", "tunnel-url.txt"),
        path.resolve(process.cwd(), "..", "tools", "tunnel-url.txt"),
      ];
      for (const tunnelFile of candidates) {
        if (existsSync(tunnelFile)) {
          try {
            const raw = (await readFile(tunnelFile, "utf8")).trim();
            if (raw.startsWith("http")) {
              tunnelUrl = raw;
              break;
            }
          } catch {
            /* ignore */
          }
        }
      }
    }
    await Promise.all([
      saveWorkerHeartbeat({
        phase: snap.phase,
        connected: snap.connected,
        phone: snap.phone ?? null,
        pairingCode: snap.pairingCode ?? null,
        qrDataUrl: snap.qrDataUrl ?? null,
        tunnelUrl: tunnelUrl ?? null,
        error: snap.error ?? null,
        updatedAt: new Date().toISOString(),
      }),
      acquireWorkerLease(WORKER_INSTANCE_ID, 30_000),
    ]);
  } catch {
    /* heartbeat failure is non-blocking */
  }
}

// Background sync heartbeat every 8 seconds
if (typeof setInterval !== "undefined") {
  const hbTimer = setInterval(() => {
    void syncWorkerHeartbeat();
  }, 8_000);
  if (hbTimer && typeof hbTimer.unref === "function") {
    hbTimer.unref();
  }
}


export async function exportAuthArchive() {
  await persistAuthDir();
  const files = await loadAuthFiles();
  return {
    files,
    phone: manager.snapshot.phone,
    savedAt: manager.snapshot.lastConnectedAt ?? new Date().toISOString(),
  };
}

export async function importAuthArchive(archive: { files?: Record<string, string> }) {
  const files = archive.files ?? {};
  if (!files["creds.json"]) {
    throw new Error("Saved login invalid hai. creds.json missing.");
  }
  await saveAuthFiles(files);
  await hydrateAuthDir({ overwrite: true });
  manager.snapshot.persisted = true;
  return startWhatsApp();
}

export function uptimeMs() {
  return Date.now() - startedAt;
}

async function hydrateAuthDir(opts?: { overwrite?: boolean }) {
  await mkdir(AUTH_DIR, { recursive: true });
  const diskPath = path.join(AUTH_DIR, "creds.json");
  const diskRaw = existsSync(diskPath) ? await readFile(diskPath, "utf8").catch(() => "") : "";
  if (!opts?.overwrite && diskRaw && credsAreLinked(diskRaw)) {
    manager.snapshot.persisted = true;
    manager.snapshot.phone = manager.snapshot.phone ?? phoneFromCreds(diskRaw);
    return;
  }
  const files = await loadAuthFiles();
  for (const [rel, b64] of Object.entries(files)) {
    if (rel.includes("..")) continue;
    await writeFile(path.join(AUTH_DIR, rel), Buffer.from(b64, "base64"));
  }
}

async function markPersistedFromDisk() {
  const diskPath = path.join(AUTH_DIR, "creds.json");
  if (!existsSync(diskPath)) return false;
  const raw = await readFile(diskPath, "utf8").catch(() => "");
  if (!raw || !credsAreLinked(raw)) return false;
  manager.snapshot.persisted = true;
  manager.snapshot.phone = manager.snapshot.phone ?? phoneFromCreds(raw);
  if (manager.snapshot.phase === "idle" || manager.snapshot.phase === "logged_out") {
    manager.snapshot.phase = "connecting";
  }
  return true;
}

async function persistAuthDir() {
  const files: Record<string, string> = {};
  const names = await readdir(AUTH_DIR).catch(() => []);
  for (const name of names) {
    const buf = await readFile(path.join(AUTH_DIR, name));
    files[name] = buf.toString("base64");
  }
  if (files["creds.json"]) {
    await saveAuthFiles(files);
    manager.snapshot.persisted = true;
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function persistAuthDirSoon() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistAuthDir();
  }, 1500);
}

function scheduleReconnect(immediate = false) {
  if (manager.reconnectTimer || manager.starting) return;
  if (manager.snapshot.phase === "logged_out") return;
  const base = immediate ? 1500 : manager.reconnectDelay;
  const jitter = base * (0.8 + Math.random() * 0.4);
  const delay = Math.round(jitter);
  console.log(`[whatsapp] Scheduling reconnect in ${delay}ms...`);
  manager.reconnectTimer = setTimeout(() => {
    manager.reconnectTimer = null;
    manager.reconnectDelay = Math.min(Math.round(base * 1.6), 120_000);
    void startWhatsApp();
  }, delay);
}

let keepAliveStarted = false;
let pulsing = false;
let lastReconnectAt = 0;

connectionGuardian.setSnapshotGetter(getSnapshot);
connectionGuardian.registerReconnectHandler(async () => {
  console.log("[guardian] Reconnect requested by ConnectionGuardian");
  await startWhatsApp(undefined, { force: true });
});

export async function ensureAlwaysOn() {
  migrateLegacyAuth();
  connectionGuardian.start();
  messageOutbox.setSender(async (destJid, outText) => {
    await whatsappCircuitBreaker.execute(async () => {
      await sendText(destJid, outText);
    });
  });
  await conversationEngine.outbox.initFromDatabase();
  await markPersistedFromDisk();
  await startWhatsApp();
  if (keepAliveStarted) return;
  keepAliveStarted = true;
  setInterval(() => {
    void pulseWhatsApp();
  }, 20_000);
}

async function pulseWhatsApp() {
  if (pulsing) return;
  pulsing = true;
  try {
    if (manager.snapshot.phase === "logged_out") return;
    if (manager.starting) return;
    if (manager.snapshot.phase === "qr" && manager.sock) return;
    const sock = manager.sock as { user?: { id?: string }; ws?: { readyState?: number } } | null;
    const wsOpen = Boolean(sock?.user) && (typeof sock?.ws?.readyState !== "number" || sock.ws.readyState === 1);
    const stale = Date.now() - lastFrameAt >= STALE_MS;
    if (wsOpen && !stale) {
      const ok = await withTimeout(
        Promise.resolve(manager.sock?.sendPresenceUpdate("available")).then(() => true),
        4000,
      );
      if (ok) {
        touchFrame();
        return;
      }
      if (Date.now() - lastFrameAt < STALE_MS) return;
    }
    if (wsOpen && stale) {
      console.warn("[whatsapp] socket looks open but WhatsApp is silent — reconnecting");
    }
    await startWhatsApp(undefined, { force: true });
  } finally {
    pulsing = false;
  }
}

export async function logoutWhatsApp() {
  try {
    await manager.sock?.logout();
  } catch {
    /* ignore */
  }
  manager.sock = null;
  manager.generation += 1;
  await rm(AUTH_DIR, { recursive: true, force: true });
  await clearAuthFiles();
  manager.snapshot = { ...empty(), phase: "logged_out" };
  return manager.snapshot;
}

export async function sendWhatsApp(chatId: string, text: string) {
  if (!isSocketLive() || !manager.sock) {
    throw new Error("WhatsApp is not linked.");
  }
  const responseId = `out_admin_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await conversationEngine.outbox.enqueue({
    responseId,
    chatId,
    text,
    metadata: { source: "admin" },
  });
  const customer = await upsertCustomer({
    number: chatId.replace(/@s\.whatsapp\.net$/, ""),
    name: chatId,
  });
  const convo = await upsertConversation(customer.id, chatId);
  await addMessage({
    conversation_id: convo.id,
    whatsapp_message_id: responseId,
    direction: "out",
    message_type: "text",
    text,
    media_reference: null,
    ai_generated: false,
    intent: "admin",
  });
}

export async function startWhatsApp(pairingPhone?: string, opts?: { force?: boolean }) {
  if (manager.starting) return getSnapshot();
  if (!opts?.force && isSocketReallyLive()) return getSnapshot();
  if (!opts?.force && manager.snapshot.phase === "qr" && manager.sock) return getSnapshot();
  const sock = manager.sock as { user?: { id?: string }; ws?: { readyState?: number } } | null;
  if (
    !opts?.force &&
    sock?.user &&
    (typeof sock.ws?.readyState !== "number" || sock.ws.readyState === 1) &&
    Date.now() - lastFrameAt < STALE_MS
  ) {
    return getSnapshot();
  }
  if (opts?.force && Date.now() - lastReconnectAt < 8000) return getSnapshot();
  lastReconnectAt = Date.now();
  manager.starting = true;
  await markPersistedFromDisk();
  manager.snapshot = {
    ...manager.snapshot,
    phase: manager.snapshot.persisted ? "connecting" : "connecting",
    error: null,
  };
  try {
    await openSocket(pairingPhone);
  } catch (error) {
    manager.snapshot.error = error instanceof Error ? error.message : "WhatsApp start failed.";
    scheduleReconnect();
  } finally {
    manager.starting = false;
  }
  return manager.snapshot;
}

async function openSocket(pairingPhone?: string) {
  const baileys = await import("@whiskeysockets/baileys");
  const {
    default: makeWASocket,
    Browsers,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    useMultiFileAuthState,
  } = baileys;

  await hydrateAuthDir();
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  await saveCreds();

  if (manager.sock) {
    const prev = manager.sock;
    manager.sock = null;
    manager.generation += 1;
    try {
      prev.end(undefined);
    } catch {
      /* ignore */
    }
  }
  manager.generation += 1;
  const generation = manager.generation;

  const version = await Promise.race([
    fetchLatestBaileysVersion().then((r) => r.version),
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 5000)),
  ]);

  const logger = pino({ level: "silent" });
  const sock = makeWASocket({
    ...(version ? { version } : {}),
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    browser: Browsers.ubuntu("Chrome"),
    retryRequestDelayMs: 400,
    maxMsgRetryCount: 5,
    keepAliveIntervalMs: 15_000,
    connectTimeoutMs: 30_000,
    defaultQueryTimeoutMs: 60_000,
    fireInitQueries: false,
    markOnlineOnConnect: true,
    emitOwnEvents: false,
    syncFullHistory: false,
    shouldIgnoreJid: (jid: string) => Boolean(jid?.endsWith("@broadcast") || jid?.endsWith("@newsletter")),
    getMessage: async (key: { id?: string | null }) => {
      const stored = key.id ? inboundStore.get(key.id) : undefined;
      return (stored ?? { conversation: "" }) as never;
    },
  });
  manager.sock = sock;

  const digits = pairingPhone?.replace(/\D/g, "") ?? "";
  if (digits.length >= 10 && !state.creds.registered) {
    try {
      manager.snapshot.pairingCode = await sock.requestPairingCode(digits);
    } catch (error) {
      manager.snapshot.error = error instanceof Error ? error.message : "Pairing failed.";
    }
  }

  sock.ev.on("creds.update", async () => {
    await saveCreds();
    persistAuthDirSoon();
  });

  sock.ev.on("connection.update", async (update) => {
    if (generation !== manager.generation || manager.sock !== sock) return;
    const { connection, lastDisconnect, qr } = update;
    if (qr && manager.snapshot.phase !== "ready") {
      connectionStateMachine.transition("QR_REQUIRED", "QR code presented for scanning");
      const saved = manager.snapshot.persisted || Boolean(state.creds.registered);
      if (!saved) {
        manager.snapshot = {
          ...manager.snapshot,
          phase: "qr",
          qrDataUrl: await QRCode.toDataURL(qr, { width: 280, margin: 1 }),
          error: null,
        };
        void syncWorkerHeartbeat();
      }
    }
    if (connection === "open") {
      touchFrame();
      const phone = sock.user?.id?.split(":")[0] ?? sock.user?.id ?? null;
      manager.reconnectDelay = 1500;
      await persistAuthDir();
      connectionStateMachine.transition("CONNECTED", `Linked ${phone ?? ""}`);
      whatsappCircuitBreaker.recordSuccess();
      manager.snapshot = {
        ...manager.snapshot,
        phase: "ready",
        connected: true,
        phone,
        qrDataUrl: null,
        pairingCode: null,
        persisted: true,
        error: null,
        lastConnectedAt: new Date().toISOString(),
      };
      void syncWorkerHeartbeat();
      await addLog("info", "whatsapp", `Linked ${phone ?? ""}`.trim());
      try {
        await sock.sendPresenceUpdate("available");
        touchFrame();
      } catch {
        /* presence is best-effort */
      }
      void conversationEngine.outbox.processQueue();
    }
    if (connection === "close") {
      const err = lastDisconnect?.error as { message?: string; output?: { statusCode?: number } } | undefined;
      const statusCode = err?.output?.statusCode;
      const isQrTimeout = Boolean(err?.message && /QR refs attempts ended|QR code expired/i.test(err.message));
      if (manager.sock === sock) manager.sock = null;
      const dead = shouldWipeAuth(statusCode);
      if (dead) {
        connectionStateMachine.transition("LOGGED_OUT", "Session ended (401)");
        await rm(AUTH_DIR, { recursive: true, force: true });
        await clearAuthFiles();
        manager.snapshot = {
          ...empty(),
          phase: "connecting",
          error: "Previous session closed. Generating new connection...",
        };
        manager.reconnectDelay = 800;
        void syncWorkerHeartbeat();
        scheduleReconnect(true);
        return;
      }
      if (isQrTimeout) {
        console.log("[whatsapp] QR scan window timed out. Refreshing QR code...");
        connectionStateMachine.transition("QR_REQUIRED", "QR code refreshed");
        manager.reconnectDelay = 1500;
        manager.snapshot.connected = false;
        manager.snapshot.phase = "qr";
        manager.snapshot.error = "QR code refreshed. Please scan with WhatsApp.";
        void syncWorkerHeartbeat();
        scheduleReconnect(true);
        return;
      }
      connectionStateMachine.transition("RECONNECTING", "Connection closed, reconnecting");
      whatsappCircuitBreaker.recordFailure();
      manager.snapshot.connected = false;
      manager.snapshot.phase = manager.snapshot.persisted ? "connecting" : "connecting";
      manager.snapshot.qrDataUrl = null;
      manager.snapshot.error = manager.snapshot.persisted
        ? "WhatsApp connection dropped. Reconnecting..."
        : "QR expired or connection dropped. Generating new QR code...";
      void syncWorkerHeartbeat();
      scheduleReconnect();
    }
  });

  type WaRaw = {
    key: {
      id?: string | null;
      fromMe?: boolean | null;
      remoteJid?: string | null;
      remoteJidAlt?: string | null;
      participant?: string | null;
      participantAlt?: string | null;
      participantPn?: string | null;
      senderPn?: string | null;
    };
    pushName?: string | null;
    message?: Record<string, unknown> | null;
    messageTimestamp?: number | { toNumber?: () => number } | null;
  };

  function waTimestampMs(raw: WaRaw) {
    const ts = raw.messageTimestamp;
    const n = typeof ts === "number" ? ts : typeof ts?.toNumber === "function" ? ts.toNumber() : 0;
    if (!n) return Date.now();
    return n > 1e12 ? n : n * 1000;
  }

  const decryptWait = new Set<string>();

  function scheduleDecryptWait(jid: string, id: string, raw: WaRaw) {
    if (decryptWait.has(id)) return;
    decryptWait.add(id);
    setTimeout(() => {
      void (async () => {
        if (await wasProcessed(id) || await wasProcessed(`out_${id}`)) return;
        if (isDuplicate(id)) return;
        const stored = inboundStore.get(id) as Record<string, unknown> | undefined;
        if (stored && !isInboundStub(stored)) {
          await ingestRaw({ ...raw, message: stored }, "notify");
        }
      })().catch((error) => {
        console.error("[whatsapp] decrypt wait failed", error);
      });
    }, 7000);
  }

  async function ingestRaw(raw: WaRaw, source: "notify" | "append" | "history" | "update") {
    if (generation !== manager.generation || manager.sock !== sock) return;
    touchFrame();
    const { chatJid: jid, phoneHints } = resolveChat(raw.key);
    const id = raw.key.id;
    if (!isSendableJid(jid) || !id) return;
    personForChat(jid, raw.pushName || undefined, phoneHints);
    if (raw.message) inboundStore.set(id, raw.message);
    if (inboundStore.size > 500) inboundStore.delete(inboundStore.keys().next().value ?? "");

    // 1. Ignore own messages
    if (raw.key.fromMe) return;

    // 2. Strict live-event gate: NEVER auto-reply on historical sync, appends, or updates
    if (source !== "notify") return;

    // 3. Strict recency gate: discard stale messages older than 60s
    const ageMs = Date.now() - waTimestampMs(raw);
    if (ageMs > 60_000 || ageMs < -10_000) {
      console.log(`[whatsapp] Discarding stale message (${Math.round(ageMs / 1000)}s old):`, id);
      return;
    }

    // 4. Strict deduplication check across memory and database
    if (await wasProcessed(id) || await wasProcessed(`out_${id}`)) return;
    if (isDuplicate(id)) return;

    // 5. Atomic inbound message claim (Phase 22 / Phase 23)
    const claim = await claimInboundMessage({
      messageId: id,
      eventId: `evt_${id}`,
      chatId: jid,
      senderId: raw.key.participant || jid,
      source: "notify",
    });
    if (!claim.claimed) {
      console.log(`[whatsapp] Message ${id} already claimed by another turn or instance, dropping.`);
      return;
    }

    const body = (raw.message ?? inboundStore.get(id)) as Record<string, unknown> | undefined;
    if (isInboundStub(body ?? null)) {
      scheduleDecryptWait(jid, id, raw);
      return;
    }
    const normalized = normalizeIncoming({
      id,
      jid,
      fromMe: Boolean(raw.key.fromMe),
      pushName: raw.pushName || undefined,
      message: body,
      timestamp: Math.floor(waTimestampMs(raw) / 1000),
    });
    if (!normalized) return;
    if (normalized.type === "reaction") return;
    if (!normalized.text.trim()) {
      const person = personForChat(jid, raw.pushName || undefined, phoneHints);
      normalized.text =
        person?.voice === "love"
          ? "Received. Please let me know what you need."
          : "Received. Please describe what you need in text.";
    }

    // Persist processed marker immediately in database and memory
    await markProcessed(id);

    manager.snapshot.lastMessageReceivedAt = new Date().toISOString();
    connectionGuardian.recordMessage();
    const customer = await upsertCustomer({
      number: jid.replace(/@s\.whatsapp\.net$/, "").replace(/@lid$/, ""),
      name: normalized.fromName,
    });
    const convo = await upsertConversation(customer.id, jid);
    await addMessage({
      conversation_id: convo.id,
      whatsapp_message_id: id,
      direction: "in",
      message_type: normalized.type,
      text: normalized.text,
      media_reference: null,
      ai_generated: false,
      intent: null,
    });
    const contextInfo = (body?.extendedTextMessage as { contextInfo?: Record<string, unknown> } | undefined)?.contextInfo;
    const quotedRaw = contextInfo?.quotedMessage as Record<string, unknown> | undefined;
    const quotedText = quotedRaw
      ? typeof quotedRaw.conversation === "string"
        ? quotedRaw.conversation
        : (quotedRaw.extendedTextMessage as { text?: string } | undefined)?.text ?? ""
      : "";
    const quotedSender = typeof contextInfo?.participant === "string" ? contextInfo.participant : undefined;
    const quotedId = typeof contextInfo?.stanzaId === "string" ? contextInfo.stanzaId : undefined;

    conversationEngine.acceptInboundEvent({
      tenantId: "default",
      chatId: jid,
      messageId: id,
      text: normalized.text,
      sender: normalized.sender,
      fromName: normalized.fromName,
      timestamp: waTimestampMs(raw),
      quoted: quotedText
        ? {
            id: quotedId,
            text: quotedText,
            sender: quotedSender,
          }
        : undefined,
      isGroup: Boolean(normalized.isGroup),
      mediaType: normalized.type,
    });
  }

  sock.ev.on("messages.upsert", ({ messages, type }) => {
    // Phase 23: ONLY type === 'notify' triggers automated conversation turns
    if (type !== "notify") return;
    void (async () => {
      for (const raw of messages) {
        try {
          await ingestRaw(raw as WaRaw, "notify");
        } catch (error) {
          await addLog("error", "whatsapp", error instanceof Error ? error.message : "message failed");
        }
      }
    })().catch((error) => {
      console.error("[whatsapp] upsert failed", error);
    });
  });

  sock.ev.on("messages.update", (updates) => {
    // Phase 23: messages.update updates decrypted payload cache only, NEVER triggers a new reply
    void (async () => {
      for (const row of updates) {
        const message = (row.update as { message?: Record<string, unknown> } | undefined)?.message;
        const id = row.key?.id;
        if (id && message) {
          inboundStore.set(id, message);
        }
      }
    })().catch((error) => {
      console.error("[whatsapp] messages.update handler error", error);
    });
  });

  sock.ev.on("messaging-history.set", (payload) => {
    // Phase 23: messaging-history.set caches history only, NEVER triggers automated replies
    const messages = (payload as { messages?: WaRaw[] }).messages ?? [];
    for (const raw of messages) {
      const id = raw.key?.id;
      if (id && raw.message) {
        inboundStore.set(id, raw.message);
      }
    }
  });
}
