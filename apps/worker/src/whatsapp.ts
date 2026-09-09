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
  setConversationStatus,
  upsertConversation,
  upsertCustomer,
  wasProcessed,
} from "@bot/database";
import type { NormalizedMessage } from "@bot/shared";
import { analyzeMessage, combineBurstText, debounceChat, forgetDuplicate, generateBestHumanReply, isCannedFallback, isDuplicate, isInboundStub, matchAllFaqs, matchAllRules, normalizeIncoming, routeMessage, writeCompleteFallback, writeSpokenReply, avoidRepeat } from "@bot/engine";
import { personForChat } from "./people-map.ts";
import { isSendableJid, resolveChat } from "./chat-address.ts";
import { authDir, migrateLegacyAuth } from "./paths.ts";
import { credsAreLinked, phoneFromCreds, shouldWipeAuth } from "./session-policy.ts";

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

const pendingReplies = new Map<string, NormalizedMessage[]>();
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
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await sock.sendMessage(jid, { text });
      manager.snapshot.lastMessageSentAt = new Date().toISOString();
      touchFrame();
      return;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (/jidDecode|invalid jid|No session/i.test(message) && attempt === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("send failed");
}

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
      error: "WhatsApp silent ho gaya. Wapas jod raha hoon.",
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

function scheduleReconnect() {
  if (manager.reconnectTimer || manager.starting) return;
  if (manager.snapshot.phase === "logged_out") return;
  const delay = manager.reconnectDelay;
  manager.reconnectTimer = setTimeout(() => {
    manager.reconnectTimer = null;
    manager.reconnectDelay = Math.min(delay * 2, 15_000);
    void startWhatsApp();
  }, delay);
}

let keepAliveStarted = false;
let pulsing = false;
let lastReconnectAt = 0;

export async function ensureAlwaysOn() {
  const settings = await getSettings();
  await saveSettings({
    ...settings,
    enabled: true,
    aiEnabled: true,
    replyToMedia: true,
    businessHours: { ...settings.businessHours, enabled: false },
  });
  migrateLegacyAuth();
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
  await manager.sock.sendMessage(chatId, { text });
  manager.snapshot.lastMessageSentAt = new Date().toISOString();
  const customer = await upsertCustomer({
    number: chatId.replace(/@s\.whatsapp\.net$/, ""),
    name: chatId,
  });
  const convo = await upsertConversation(customer.id, chatId);
  await addMessage({
    conversation_id: convo.id,
    whatsapp_message_id: `out_admin_${Date.now()}`,
    direction: "out",
    message_type: "text",
    text,
    media_reference: null,
    ai_generated: false,
    intent: "admin",
  });
}

async function replyToBurst(jid: string, batch: NormalizedMessage[]) {
  if (!batch.length) return;
  if (!manager.sock) {
    pendingReplies.set(jid, batch);
    scheduleReconnect();
    return;
  }
  const last = batch[batch.length - 1];
  const combined = { ...last, text: combineBurstText(batch.map((row) => row.text)) || last.text };
  const person = personForChat(jid, combined.fromName, combined.sender);
  if (person) combined.fromName = person.name;
  let settings = await getSettings();
  if (!settings.enabled) {
    settings = { ...settings, enabled: true, aiEnabled: true };
    await saveSettings(settings);
  }
  const rules = await getRules();
  const faqs = await getFaqs();
  const customer = await upsertCustomer({
    number: jid.replace(/@s\.whatsapp\.net$/, "").replace(/@lid$/, ""),
    name: person?.name ?? combined.fromName,
  });
  const convo = await upsertConversation(customer.id, jid);
  if (convo.status !== "bot") {
    await setConversationStatus(convo.id, "bot");
    convo.status = "bot";
  }
  const history = await recentMessages(convo.id);
  const knowledge = await knowledgeSearch(combined.text);
  const inboundCount = history.filter((m) => m.direction === "in").length;
  const recent = history
    .slice()
    .reverse()
    .map((m) => ({
      role: m.direction === "in" ? ("user" as const) : ("assistant" as const),
      text: m.text,
    }));
  const analysis = analyzeMessage(combined.text, {
    isFirstMessage: inboundCount <= batch.length,
    inboundCount,
  });
  const routed = routeMessage({
    message: combined,
    settings,
    rules,
    faqs,
    conversationStatus: "bot",
    knowledgeHits: knowledge,
    aiReply: null,
  });
  if (routed.action === "skip" && routed.intent === "group") return;
  const faqFacts = matchAllFaqs(combined.text, faqs).map((f) => `${f.question}: ${f.answer}`);
  const ruleFacts = matchAllRules(combined.text, rules)
    .filter((r) => !/agent|human/.test(r.triggerValue))
    .map((r) => r.response);
  const spoken = writeSpokenReply(combined.text, analysis, recent, person ?? undefined);
  const suggested = analysis.wantsAllAnswers
    ? writeCompleteFallback(analysis, [...faqFacts, ...ruleFacts, ...knowledge], combined.text)
    : isCannedFallback(routed.text)
      ? spoken
      : routed.text;
  const ai =
    settings.aiEnabled !== false
      ? await withTimeout(
          generateBestHumanReply(combined, {
            settings,
            customerName: person?.name ?? combined.fromName,
            recent,
            faqs: [...faqFacts, ...faqs.map((f) => `${f.question}: ${f.answer}`)],
            knowledge: [...knowledge, ...ruleFacts],
            intent: analysis.intents.join(","),
            suggested,
            analysis,
            isFirstMessage: inboundCount <= batch.length,
            messageType: combined.type,
            person: person ?? undefined,
          }),
          7500,
        )
      : null;
  let text =
    ai?.text ||
    (analysis.wantsAllAnswers
      ? writeCompleteFallback(analysis, [...faqFacts, ...ruleFacts, ...knowledge], combined.text)
      : spoken);
  if (!text || isCannedFallback(text)) text = spoken;
  text = avoidRepeat(text, recent);
  if (!text) text = spoken || "haan, sun raha hoon";
  pendingReplies.set(jid, batch);
  try {
    await sendText(jid, text);
    pendingReplies.delete(jid);
    await addMessage({
      conversation_id: convo.id,
      whatsapp_message_id: `out_${combined.whatsappMessageId}`,
      direction: "out",
      message_type: "text",
      text,
      media_reference: null,
      ai_generated: Boolean(ai),
      intent: routed.intent ?? routed.source,
    });
  } catch (error) {
    manager.snapshot.connected = false;
    for (const row of batch) forgetDuplicate(row.whatsappMessageId);
    await addLog("error", "whatsapp", error instanceof Error ? error.message : "send failed");
    scheduleReconnect();
  }
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
      const saved = manager.snapshot.persisted || Boolean(state.creds.registered);
      if (!saved) {
        manager.snapshot = {
          ...manager.snapshot,
          phase: "qr",
          qrDataUrl: await QRCode.toDataURL(qr, { width: 280, margin: 1 }),
          error: null,
        };
      }
    }
    if (connection === "open") {
      touchFrame();
      const phone = sock.user?.id?.split(":")[0] ?? sock.user?.id ?? null;
      manager.reconnectDelay = 1500;
      await persistAuthDir();
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
      await addLog("info", "whatsapp", `Linked ${phone ?? ""}`.trim());
      try {
        await sock.sendPresenceUpdate("available");
        touchFrame();
      } catch {
        /* presence is best-effort */
      }
      for (const [jid, batch] of pendingReplies) {
        void replyToBurst(jid, batch);
      }
    }
    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output
        ?.statusCode;
      if (manager.sock === sock) manager.sock = null;
      const dead = shouldWipeAuth(statusCode);
      if (dead) {
        await rm(AUTH_DIR, { recursive: true, force: true });
        await clearAuthFiles();
        manager.snapshot = {
          ...empty(),
          phase: "connecting",
          error: "Pehle wala QR/login band ho gaya. Naya QR aa raha hai.",
        };
        manager.reconnectDelay = 800;
        scheduleReconnect();
        return;
      }
      manager.snapshot.connected = false;
      manager.snapshot.phase = manager.snapshot.persisted ? "connecting" : "connecting";
      manager.snapshot.qrDataUrl = null;
      manager.snapshot.error = manager.snapshot.persisted
        ? "WhatsApp drop ho gaya. Wapas jod raha hoon."
        : "QR expire / drop. Naya QR aa raha hai.";
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

  function isRecentInbound(raw: WaRaw) {
    return Date.now() - waTimestampMs(raw) < 2 * 60 * 60 * 1000;
  }

  const decryptWait = new Set<string>();

  function scheduleDecryptWait(jid: string, id: string, raw: WaRaw) {
    if (decryptWait.has(id)) return;
    decryptWait.add(id);
    setTimeout(() => {
      void (async () => {
        if (await wasProcessed(`out_${id}`)) return;
        if (isDuplicate(id)) return;
        const stored = inboundStore.get(id) as Record<string, unknown> | undefined;
        if (stored && !isInboundStub(stored)) {
          await ingestRaw({ ...raw, message: stored }, "update");
          return;
        }
        const normalized = normalizeIncoming({
          id,
          jid,
          fromMe: false,
          pushName: raw.pushName || undefined,
          message: { conversation: "message aa gaya. kripya ek line text likh dena" },
          timestamp: Math.floor(Date.now() / 1000),
        });
        if (!normalized) return;
        if (isDuplicate(id)) return;
        manager.snapshot.lastMessageReceivedAt = new Date().toISOString();
        debounceChat(jid, normalized, (batch) => {
          void replyToBurst(jid, batch);
        });
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
    if (raw.key.fromMe) return;
    if (source !== "notify" && !isRecentInbound(raw)) return;
    if (await wasProcessed(`out_${id}`)) return;
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
          ? "haan meri jaan, sun raha hoon. text mein likh dijiye"
          : "aa gaya. kripya text mein likh dena kya chahiye";
    }
    if (isDuplicate(id)) return;
    manager.snapshot.lastMessageReceivedAt = new Date().toISOString();
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
    debounceChat(jid, normalized, (batch) => {
      void replyToBurst(jid, batch);
    });
  }

  sock.ev.on("messages.upsert", ({ messages, type }) => {
    const source = type === "append" ? "append" : "notify";
    void (async () => {
      for (const raw of messages) {
        try {
          await ingestRaw(raw as WaRaw, source);
        } catch (error) {
          const id = raw.key.id;
          if (id) forgetDuplicate(id);
          await addLog("error", "whatsapp", error instanceof Error ? error.message : "message failed");
        }
      }
    })().catch((error) => {
      console.error("[whatsapp] upsert failed", error);
    });
  });

  sock.ev.on("messages.update", (updates) => {
    void (async () => {
      for (const row of updates) {
        const message = (row.update as { message?: Record<string, unknown> } | undefined)?.message;
        if (!message) continue;
        try {
          await ingestRaw({ key: row.key, message, messageTimestamp: Date.now() / 1000 }, "update");
        } catch (error) {
          const id = row.key.id;
          if (id) forgetDuplicate(id);
          await addLog("error", "whatsapp", error instanceof Error ? error.message : "message update failed");
        }
      }
    })().catch((error) => {
      console.error("[whatsapp] messages.update failed", error);
    });
  });

  sock.ev.on("messaging-history.set", (payload) => {
    const messages = (payload as { messages?: WaRaw[] }).messages ?? [];
    void (async () => {
      for (const raw of messages) {
        try {
          await ingestRaw(raw, "history");
        } catch {
          /* catch-up is best-effort */
        }
      }
    })().catch((error) => {
      console.error("[whatsapp] history catch-up failed", error);
    });
  });
}
