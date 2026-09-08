import { mkdir } from "node:fs/promises";
import pino from "pino";
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
  start: (pairingPhone?: string) => Promise<ScanSnapshot>;
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
  pairingCode: null,
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
      if (snap.qrDataUrl || snap.pairingCode || snap.phase === "ready" || snap.phase === "logged_out") {
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
            "WhatsApp ne code late bheja. Show QR ya pairing dubara try karo.",
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
    async start(pairingPhone?: string) {
      if (manager.sock && manager.snapshot.phase !== "logged_out") {
        if (manager.snapshot.phase === "ready") return manager.snapshot;
        if (
          manager.snapshot.phase === "qr" ||
          manager.snapshot.phase === "connecting"
        ) {
          const digits = pairingPhone?.replace(/\D/g, "") ?? "";
          if (digits.length >= 10 && !manager.snapshot.pairingCode) {
            try {
              const pairingCode = await manager.sock.requestPairingCode(digits);
              manager.snapshot = await snapshotWithSave({
                ...manager.snapshot,
                pairingCode,
                phone: digits,
                error: null,
              });
            } catch {
              // keep showing the live QR
            }
          }
          return manager.snapshot;
        }
      }
      if (manager.starting) return manager.snapshot;
      manager.starting = true;
      const restored = await restoreSavedSession();
      const saved = await getSavedPhone();
      manager.snapshot = await snapshotWithSave({
        phase: manager.snapshot.qrDataUrl ? "qr" : "connecting",
        qrDataUrl: manager.snapshot.qrDataUrl,
        phone: saved.phone,
        pairingCode: null,
        error: restored ? "Saved login se reconnect ho raha hai…" : null,
      });
      try {
        await openSocket(manager, pairingPhone);
        manager.snapshot = await waitForQrOrReady(manager, pairingPhone ? 45_000 : 25_000);
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

async function openSocket(manager: Manager, pairingPhone?: string) {
  const baileys: BaileysModule = await import("@whiskeysockets/baileys");
  const {
    default: makeWASocket,
    Browsers,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    useMultiFileAuthState: loadAuthState,
  } = baileys;

  const authDir = getAuthDir();
  await mkdir(authDir, { recursive: true });
  const { state, saveCreds } = await loadAuthState(authDir);
  // Official Baileys auth: write creds.json immediately, not only after Linked.
  await saveCreds();
  await persistSavedSession(manager.snapshot.phone);

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

  const logger = pino({ level: "silent" });
  const sock = makeWASocket({
    ...(version ? { version } : {}),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    browser: Browsers.ubuntu("Chrome"),
    syncFullHistory: false,
    markOnlineOnConnect: false,
    connectTimeoutMs: 30_000,
    qrTimeout: 40_000,
  });
  manager.sock = sock;

  const digits = pairingPhone?.replace(/\D/g, "") ?? "";
  if (digits.length >= 10 && !state.creds.registered) {
    try {
      const pairingCode = await sock.requestPairingCode(digits);
      manager.snapshot = await snapshotWithSave({
        phase: "connecting",
        pairingCode,
        phone: digits,
        error: null,
      });
    } catch (error) {
      manager.snapshot = await snapshotWithSave({
        phase: "connecting",
        error: error instanceof Error ? error.message : "Pairing code nahi mila.",
      });
    }
  }

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
        pairingCode: manager.snapshot.pairingCode,
        phone: manager.snapshot.phone,
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
      setTimeout(() => {
        void persistSavedSession(phone).then(async () => {
          manager.snapshot = await snapshotWithSave(manager.snapshot);
        });
      }, 750);
      setTimeout(() => {
        void persistSavedSession(phone);
      }, 2500);
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
        error: (await hasSavedSession())
          ? "Line drop hui. Saved login se reconnect ho raha hai…"
          : "QR expire / drop. Naya QR aa raha hai — wahi scan karo.",
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

export async function startScanSession(pairingPhone?: string): Promise<ScanSnapshot> {
  return getManager().start(pairingPhone);
}

export async function logoutScanSession(): Promise<ScanSnapshot> {
  return getManager().logout();
}
