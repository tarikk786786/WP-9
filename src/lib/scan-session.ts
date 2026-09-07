import { mkdir, rm } from "node:fs/promises";
import QRCode from "qrcode";
import { composeReply } from "@/lib/compose-reply";
import { recordReply } from "@/lib/record-reply";
import { getRules, markProcessed, wasProcessed } from "@/lib/store";
import type { ScanSnapshot } from "@/lib/types";
import { writablePath } from "@/lib/writable-dir";

type BaileysModule = typeof import("@whiskeysockets/baileys");

type Socket = import("@whiskeysockets/baileys").WASocket;

type Manager = {
  snapshot: ScanSnapshot;
  sock: Socket | null;
  starting: boolean;
  start: () => Promise<ScanSnapshot>;
  logout: () => Promise<ScanSnapshot>;
};

const AUTH_DIR = writablePath("baileys-auth");

const emptySnapshot = (): ScanSnapshot => ({
  phase: "idle",
  qrDataUrl: null,
  phone: null,
  error: null,
});

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

function createManager(): Manager {
  const manager: Manager = {
    snapshot: emptySnapshot(),
    sock: null,
    starting: false,
    async start() {
      if (manager.snapshot.phase === "ready" && manager.sock) {
        return manager.snapshot;
      }
      if (manager.starting) return manager.snapshot;
      manager.starting = true;
      manager.snapshot = {
        ...manager.snapshot,
        phase: manager.snapshot.qrDataUrl ? "qr" : "connecting",
        error: null,
      };
      try {
        await openSocket(manager);
      } catch (error) {
        manager.snapshot = {
          ...emptySnapshot(),
          phase: "logged_out",
          error: error instanceof Error ? error.message : "Could not start WhatsApp scan.",
        };
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
      await rm(AUTH_DIR, { recursive: true, force: true });
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

  await mkdir(AUTH_DIR, { recursive: true });
  const { state, saveCreds } = await loadAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  if (manager.sock) {
    try {
      manager.sock.end(undefined);
    } catch {
      // replace the previous socket
    }
  }

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: Browsers.ubuntu("Chrome"),
    syncFullHistory: false,
  });
  manager.sock = sock;

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      manager.snapshot = {
        phase: "qr",
        qrDataUrl: await QRCode.toDataURL(qr, { width: 280, margin: 1 }),
        phone: null,
        error: null,
      };
    }
    if (connection === "connecting") {
      manager.snapshot = {
        ...manager.snapshot,
        phase: manager.snapshot.qrDataUrl ? "qr" : "connecting",
        error: null,
      };
    }
    if (connection === "open") {
      const phone = sock.user?.id?.split(":")[0] ?? sock.user?.id ?? null;
      manager.snapshot = {
        phase: "ready",
        qrDataUrl: null,
        phone,
        error: null,
      };
    }
    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)
        ?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      manager.sock = null;
      if (loggedOut) {
        await rm(AUTH_DIR, { recursive: true, force: true });
        manager.snapshot = {
          ...emptySnapshot(),
          phase: "logged_out",
          error: "WhatsApp logged this device out. Show a new QR to link again.",
        };
        return;
      }
      manager.snapshot = {
        ...manager.snapshot,
        phase: "connecting",
        qrDataUrl: null,
        error: "Connection dropped. Reconnecting…",
      };
      setTimeout(() => {
        void manager.start();
      }, 2000);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const rules = await getRules();
    for (const message of messages) {
      if (message.key.fromMe) continue;
      const jid = message.key.remoteJid;
      if (!jid || jid === "status@broadcast" || jid.endsWith("@g.us") || jid.endsWith("@broadcast")) {
        continue;
      }
      const id = message.key.id;
      if (!id || (await wasProcessed(`scan_${id}`))) continue;
      await markProcessed(`scan_${id}`);

      const body = textFromMessage(message.message as Record<string, unknown> | undefined);
      if (!body) continue;

      const fromName =
        message.pushName ||
        (typeof jid === "string" ? jid.replace(/@s\.whatsapp\.net$/, "") : "Contact");
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

export async function startScanSession(): Promise<ScanSnapshot> {
  return getManager().start();
}

export async function logoutScanSession(): Promise<ScanSnapshot> {
  return getManager().logout();
}
