import { mkdir } from "node:fs/promises";
import QRCode from "qrcode";
import { composeReply } from "@/lib/compose-reply";
import { recordReply } from "@/lib/record-reply";
import {
  getAuthDir,
  clearSavedSession,
  getSavedPhone,
  hasSavedSession,
  persistSavedSession,
  restoreSavedSession,
} from "@/lib/session-persist";
import { flushStore, getRules, markProcessed, wasProcessed } from "@/lib/store";
import type { ScanSnapshot } from "@/lib/types";
import { mediaAck } from "@/lib/voice";
import { isServerlessDisk } from "@/lib/writable-dir";

type BaileysModule = typeof import("@whiskeysockets/baileys");

type Socket = import("@whiskeysockets/baileys").WASocket;

type Manager = {
  snapshot: ScanSnapshot;
  sock: Socket | null;
  starting: boolean;
  reconnectDelay: number;
  start: () => Promise<ScanSnapshot>;
  logout: () => Promise<ScanSnapshot>;
};

function scheduleReconnect(manager: Manager) {
  const delay = manager.reconnectDelay;
  setTimeout(() => {
    manager.reconnectDelay = Math.min(delay * 2, 30_000);
    void manager.start();
  }, delay);
}

const emptySnapshot = (): ScanSnapshot => ({
  phase: "idle",
  qrDataUrl: null,
  phone: null,
  error: null,
  persisted: false,
  savedAt: null,
  serverless: isServerlessDisk(),
});

async function snapshotWithSave(
  patch: Partial<ScanSnapshot>,
): Promise<ScanSnapshot> {
  const saved = await getSavedPhone();
  const persisted = await hasSavedSession();
  return {
    ...emptySnapshot(),
    ...patch,
    persisted,
    savedAt: saved.savedAt,
    phone: patch.phone ?? saved.phone,
    serverless: isServerlessDisk(),
  };
}

function waitForQrOrReady(manager: Manager, ms: number) {
  return new Promise<ScanSnapshot>((resolve) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const snap = manager.snapshot;
      if (snap.qrDataUrl || snap.phase === "ready" || snap.phase === "logged_out") {
        clearInterval(timer);
        resolve(snap);
        return;
      }
      if (Date.now() - started >= ms) {
        clearInterval(timer);
        void snapshotWithSave({
          ...snap,
          phase: snap.qrDataUrl ? "qr" : "idle",
          error:
            snap.error ||
            "QR nahi aaya. Yeh page Vercel pe ho to laptop pe npm run live chalao — serverless QR nahi nikalta.",
        }).then(resolve);
      }
    }, 200);
  });
}

function getManager(): Manager {
  const globalRef = globalThis as typeof globalThis & { __relayScan?: Manager };
  if (!globalRef.__relayScan) {
    globalRef.__relayScan = createManager();
  }
  return globalRef.__relayScan;
}

function textFromMessage(message: Record<string, unknown> | null | undefined): string {
  if (!message) return "";
  if (typeof message.conversation === "string") return message.conversation;
  const extended = message.extendedTextMessage as { text?: string } | undefined;
  if (extended?.text) return extended.text;
  const ephemeral = message.ephemeralMessage as { message?: Record<string, unknown> } | undefined;
  if (ephemeral?.message) return textFromMessage(ephemeral.message);
  return "";
}

function mediaKind(message: Record<string, unknown> | null | undefined): string | null {
  if (!message) return null;
  if (message.imageMessage) return "image";
  if (message.audioMessage || message.pttMessage) return "voice";
  if (message.videoMessage) return "video";
  if (message.documentMessage) return "document";
  if (message.stickerMessage) return "sticker";
  if (message.locationMessage || message.liveLocationMessage) return "location";
  if (message.contactMessage || message.contactsArrayMessage) return "contact";
  return null;
}

function createManager(): Manager {
  const manager: Manager = {
    snapshot: emptySnapshot(),
    sock: null,
    starting: false,
    reconnectDelay: 2000,
    async start() {
      if (isServerlessDisk()) {
        manager.snapshot = await snapshotWithSave({
          phase: "idle",
          qrDataUrl: null,
          error:
            "QR Vercel pe nahi aata. Laptop ya VPS pe npm run live chalao, phir http://127.0.0.1:43217 kholo aur Show QR dabao.",
        });
        return manager.snapshot;
      }
      if (manager.snapshot.phase === "ready" && manager.sock) {
        return manager.snapshot;
      }
      if (manager.starting) return manager.snapshot;
      manager.starting = true;
      const restored = await restoreSavedSession();
      const saved = await getSavedPhone();
      manager.snapshot = await snapshotWithSave({
        phase: manager.snapshot.qrDataUrl ? "qr" : "connecting",
        qrDataUrl: manager.snapshot.qrDataUrl,
        phone: saved.phone,
        error: restored ? "Saved login mil gaya. Reconnect ho raha hai…" : null,
      });
      try {
        await openSocket(manager);
        manager.snapshot = await waitForQrOrReady(manager, restored ? 12_000 : 22_000);
      } catch (error) {
        manager.snapshot = await snapshotWithSave({
          phase: restored ? "connecting" : "idle",
          error: error instanceof Error ? error.message : "Could not start WhatsApp scan.",
        });
        if (restored) {
          scheduleReconnect(manager);
        }
      } finally {
        manager.starting = false;
      }
      return manager.snapshot;
    },
    async logout() {
      try {
        if (manager.sock) {
          await manager.sock.logout();
        }
      } catch {
        // Session may already be dead.
      }
      manager.sock = null;
      await clearSavedSession();
      manager.snapshot = {
        ...emptySnapshot(),
        phase: "logged_out",
      };
      return manager.snapshot;
    },
  };
  return manager;
}

async function openSocket(manager: Manager) {
  const baileys: BaileysModule = await import("@whiskeysockets/baileys");
  const {
    default: makeWASocket,
    Browsers,
    DisconnectReason,
    fetchLatestBaileysVersion,
    useMultiFileAuthState: loadAuthState,
  } = baileys;

  const authDir = getAuthDir();
  await mkdir(authDir, { recursive: true });
  const { state, saveCreds } = await loadAuthState(authDir);
  const version = await Promise.race([
    fetchLatestBaileysVersion().then((result) => result.version),
    new Promise<undefined>((resolve) => {
      setTimeout(() => resolve(undefined), 6000);
    }),
  ]);

  if (manager.sock) {
    try {
      manager.sock.end(undefined);
    } catch {
      // replace the previous socket
    }
  }

  const sock = makeWASocket({
    ...(version ? { version } : {}),
    auth: state,
    printQRInTerminal: false,
    browser: Browsers.ubuntu("Chrome"),
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });
  manager.sock = sock;

  sock.ev.on("creds.update", async () => {
    await saveCreds();
    await persistSavedSession(manager.snapshot.phone);
    manager.snapshot = await snapshotWithSave(manager.snapshot);
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      manager.snapshot = await snapshotWithSave({
        phase: "qr",
        qrDataUrl: await QRCode.toDataURL(qr, { width: 280, margin: 1 }),
        phone: null,
        error: null,
      });
    }
    if (connection === "connecting") {
      manager.snapshot = await snapshotWithSave({
        ...manager.snapshot,
        phase: manager.snapshot.qrDataUrl ? "qr" : "connecting",
        error: null,
      });
    }
    if (connection === "open") {
      const phone = sock.user?.id?.split(":")[0] ?? sock.user?.id ?? null;
      manager.reconnectDelay = 2000;
      await persistSavedSession(phone);
      await flushStore();
      manager.snapshot = await snapshotWithSave({
        phase: "ready",
        qrDataUrl: null,
        phone,
        error: null,
      });
    }
    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)
        ?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      manager.sock = null;
      if (loggedOut) {
        await clearSavedSession();
        manager.snapshot = {
          ...emptySnapshot(),
          phase: "logged_out",
          error: "WhatsApp ne is device ko logout kar diya. Naya QR scan karo.",
        };
        return;
      }
      manager.snapshot = await snapshotWithSave({
        ...manager.snapshot,
        phase: "connecting",
        qrDataUrl: null,
        error: "Line drop hui. Saved login se reconnect ho raha hai…",
      });
      scheduleReconnect(manager);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const rules = await getRules();
    for (const message of messages) {
      if (message.key.fromMe) continue;
      const jid = message.key.remoteJid;
      if (!jid || jid === "status@broadcast" || jid.endsWith("@broadcast")) {
        continue;
      }
      if (jid.endsWith("@g.us") && !rules.replyToGroups) {
        continue;
      }
      const id = message.key.id;
      if (!id || (await wasProcessed(`scan_${id}`))) continue;
      await markProcessed(`scan_${id}`);

      const raw = message.message as Record<string, unknown> | undefined;
      const body = textFromMessage(raw);
      const media = mediaKind(raw);
      const fromName =
        message.pushName ||
        (typeof jid === "string" ? jid.replace(/@s\.whatsapp\.net$/, "") : "Contact");

      if (!body && media) {
        if (!rules.replyToMedia) continue;
        const text = mediaAck(media, rules);
        try {
          if (rules.showTyping) {
            await sock.sendPresenceUpdate("composing", jid);
          }
          await sock.sendMessage(jid, { text });
        } catch {
          // keep going
        }
        await recordReply(
          {
            id: `scan_${id}`,
            from: jid,
            fromName,
            body: `[${media}]`,
            source: "scan",
            createdAt: new Date().toISOString(),
          },
          { action: "reply", text, matchedRule: media, engine: "tarik-live" },
        );
        continue;
      }

      if (!body) continue;

      const decision = await composeReply({
        text: body,
        fromName,
        fromId: jid,
        rules,
      });

      if (decision.action === "skip") {
        await recordReply(
          {
            id: `scan_${id}`,
            from: jid,
            fromName,
            body,
            source: "scan",
            createdAt: new Date().toISOString(),
          },
          decision,
        );
        continue;
      }

      try {
        if (rules.showTyping) {
          await sock.sendPresenceUpdate("composing", jid);
        }
        await sock.sendMessage(jid, { text: decision.text });
        await recordReply(
          {
            id: `scan_${id}`,
            from: jid,
            fromName,
            body,
            source: "scan",
            createdAt: new Date().toISOString(),
          },
          decision,
        );
      } catch (error) {
        await recordReply(
          {
            id: `scan_${id}`,
            from: jid,
            fromName,
            body,
            source: "scan",
            createdAt: new Date().toISOString(),
          },
          {
            action: "skip",
            reason: error instanceof Error ? error.message : "Send failed.",
            engine: decision.engine,
          },
        );
      }
    }
  });
}

export function getScanSnapshot(): ScanSnapshot {
  return getManager().snapshot;
}

export async function hydrateScanSnapshot(): Promise<ScanSnapshot> {
  const manager = getManager();
  if (isServerlessDisk()) {
    manager.snapshot = await snapshotWithSave({
      phase: "idle",
      qrDataUrl: null,
      error:
        "QR Vercel pe nahi aata. Laptop pe npm run live, phir 127.0.0.1:43217 pe Show QR.",
    });
    return manager.snapshot;
  }
  const persisted = await hasSavedSession();
  const saved = await getSavedPhone();
  if (persisted && manager.snapshot.phase === "idle") {
    manager.snapshot = await snapshotWithSave({
      phase: "connecting",
      phone: saved.phone,
      error: "Saved login ready. Always-live reconnect chal raha hai.",
    });
  } else {
    manager.snapshot = await snapshotWithSave(manager.snapshot);
  }
  return manager.snapshot;
}

export async function startScanSession(): Promise<ScanSnapshot> {
  return getManager().start();
}

export async function logoutScanSession(): Promise<ScanSnapshot> {
  return getManager().logout();
}
