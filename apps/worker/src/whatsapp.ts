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
  setConversationStatus,
  upsertConversation,
  upsertCustomer,
  wasProcessed,
} from "@bot/database";
import type { NormalizedMessage } from "@bot/shared";
import { analyzeMessage, combineBurstText, debounceChat, generateBestHumanReply, isCannedFallback, isDuplicate, matchAllFaqs, matchAllRules, normalizeIncoming, routeMessage, writeCompleteFallback, writeSpokenReply, avoidRepeat } from "@bot/engine";

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

const AUTH_DIR = path.join(process.cwd(), "data", "baileys-auth");
const startedAt = Date.now();

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

export function getSnapshot(): WorkerSnapshot {
  const snap = manager.snapshot;
  if (snap.connected && snap.phase !== "ready") {
    return { ...snap, phase: "ready" };
  }
  return snap;
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
  await hydrateAuthDir();
  manager.snapshot.persisted = true;
  return startWhatsApp();
}

export function uptimeMs() {
  return Date.now() - startedAt;
}

async function hydrateAuthDir() {
  await mkdir(AUTH_DIR, { recursive: true });
  const files = await loadAuthFiles();
  for (const [rel, b64] of Object.entries(files)) {
    if (rel.includes("..")) continue;
    await writeFile(path.join(AUTH_DIR, rel), Buffer.from(b64, "base64"));
  }
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
  const delay = manager.reconnectDelay;
  manager.reconnectTimer = setTimeout(() => {
    manager.reconnectTimer = null;
    manager.reconnectDelay = Math.min(delay * 2, 20_000);
    void startWhatsApp();
  }, delay);
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
  if (!manager.sock || manager.snapshot.phase !== "ready") {
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
  const sock = manager.sock;
  if (!sock || !batch.length) return;
  const last = batch[batch.length - 1];
  const combined = { ...last, text: combineBurstText(batch.map((row) => row.text)) };
  const settings = await getSettings();
  const rules = await getRules();
  const faqs = await getFaqs();
  const customer = await upsertCustomer({
    number: jid.replace(/@s\.whatsapp\.net$/, ""),
    name: combined.fromName,
  });
  const convo = await upsertConversation(customer.id, jid);
  const history = await recentMessages(convo.id);
  const knowledge = await knowledgeSearch(combined.text);
  const inboundCount = history.filter((m) => m.direction === "in").length;
  const recent = history
    .slice()
    .reverse()
    .map((m) => ({ role: (m.direction === "in" ? "user" : "assistant") as const, text: m.text }));
  const analysis = analyzeMessage(combined.text, {
    isFirstMessage: inboundCount <= batch.length,
    inboundCount,
  });
  const routed = routeMessage({
    message: combined,
    settings,
    rules,
    faqs,
    conversationStatus: convo.status,
    knowledgeHits: knowledge,
    aiReply: null,
  });
  if (routed.action === "handoff") {
    await setConversationStatus(convo.id, "waiting_human");
  }
  if (routed.action === "skip") return;
  if (settings.enabled === false) return;
  const faqFacts = matchAllFaqs(combined.text, faqs).map((f) => `${f.question}: ${f.answer}`);
  const ruleFacts = matchAllRules(combined.text, rules)
    .filter((r) => !/agent|human/.test(r.triggerValue))
    .map((r) => r.response);
  const spoken = writeSpokenReply(combined.text, analysis, recent);
  const suggested = analysis.wantsAllAnswers
    ? writeCompleteFallback(analysis, [...faqFacts, ...ruleFacts, ...knowledge], combined.text)
    : isCannedFallback(routed.text)
      ? spoken
      : routed.text;
  const ai =
    settings.aiEnabled !== false
      ? await generateBestHumanReply(combined, {
          settings,
          customerName: combined.fromName,
          recent,
          faqs: [...faqFacts, ...faqs.map((f) => `${f.question}: ${f.answer}`)],
          knowledge: [...knowledge, ...ruleFacts],
          intent: analysis.intents.join(","),
          suggested,
          analysis,
          isFirstMessage: inboundCount <= batch.length,
          messageType: combined.type,
        })
      : null;
  let text =
    ai?.text ||
    (analysis.wantsAllAnswers
      ? writeCompleteFallback(analysis, [...faqFacts, ...ruleFacts, ...knowledge], combined.text)
      : spoken);
  if (!text || isCannedFallback(text)) text = spoken;
  text = avoidRepeat(text, recent);
  if (!text) return;
  await sock.sendMessage(jid, { text });
  manager.snapshot.lastMessageSentAt = new Date().toISOString();
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
}

export async function startWhatsApp(pairingPhone?: string) {
  if (manager.sock && (manager.snapshot.phase === "ready" || manager.snapshot.phase === "qr")) {
    return manager.snapshot;
  }
  if (manager.starting) return manager.snapshot;
  manager.starting = true;
  manager.snapshot = { ...manager.snapshot, phase: "connecting", error: null };
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
    DisconnectReason,
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
    syncFullHistory: false,
    markOnlineOnConnect: false,
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
      manager.snapshot = {
        ...manager.snapshot,
        phase: "qr",
        qrDataUrl: await QRCode.toDataURL(qr, { width: 280, margin: 1 }),
        error: null,
      };
    }
    if (connection === "open") {
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
    }
    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output
        ?.statusCode;
      if (manager.sock === sock) manager.sock = null;
      const dead =
        statusCode === DisconnectReason.loggedOut ||
        statusCode === DisconnectReason.badSession ||
        statusCode === DisconnectReason.forbidden;
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
      if (manager.snapshot.persisted) {
        manager.snapshot.phase = "ready";
        manager.snapshot.error = null;
      } else {
        manager.snapshot.phase = "connecting";
        manager.snapshot.qrDataUrl = null;
        manager.snapshot.error = "QR expire / drop. Naya QR aa raha hai.";
      }
      scheduleReconnect();
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const raw of messages) {
      try {
        const jid = raw.key.remoteJid;
        if (!jid || !raw.key.id) continue;
        if (await wasProcessed(raw.key.id) || isDuplicate(raw.key.id)) continue;
        const normalized = normalizeIncoming({
          id: raw.key.id,
          jid,
          fromMe: Boolean(raw.key.fromMe),
          pushName: raw.pushName || undefined,
          message: raw.message as Record<string, unknown> | undefined,
          timestamp: Number(raw.messageTimestamp || 0),
        });
        if (!normalized) continue;
        manager.snapshot.lastMessageReceivedAt = new Date().toISOString();
        const customer = await upsertCustomer({
          number: jid.replace(/@s\.whatsapp\.net$/, ""),
          name: normalized.fromName,
        });
        const convo = await upsertConversation(customer.id, jid);
        await addMessage({
          conversation_id: convo.id,
          whatsapp_message_id: raw.key.id,
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
      } catch (error) {
        await addLog("error", "whatsapp", error instanceof Error ? error.message : "message failed");
      }
    }
  });
}
