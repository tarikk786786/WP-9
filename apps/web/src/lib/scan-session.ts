import { loadWorkerHeartbeat } from "@bot/database";
import {
  getWorkerDetails,
  getWorkerLive,
  workerFetch,
  workerHealth,
  workerLooksLocal,
} from "@/lib/worker-client";
import type { ScanSnapshot } from "@/lib/types";

function emptySnapshot(): ScanSnapshot {
  const onVercel = Boolean(process.env.VERCEL);
  const isProd = process.env.NODE_ENV === "production" || onVercel;
  const localUrl = workerLooksLocal();
  return {
    phase: "idle",
    qrDataUrl: null,
    phone: null,
    error: onVercel && localUrl
      ? "Vercel cannot reach a localhost worker directly. Set WORKER_API_URL to your public tunnel or worker host URL."
      : isProd
        ? "Worker URL unreachable. Keep the worker process and tunnel/host online."
        : "Worker is offline. Run 'npm run worker' to start.",
    persisted: false,
    savedAt: null,
    serverless: onVercel,
    pairingCode: null,
  };
}

export async function hydrateScanSnapshot(): Promise<ScanSnapshot> {
  const onVercel = Boolean(process.env.VERCEL);
  let workerIsAlive = false;
  try {
    const liveCheck = await getWorkerLive(3000);
    workerIsAlive = liveCheck.ok;
  } catch {
    /* ignore probe failure */
  }

  try {
    const details = await getWorkerDetails(4000);
    if (details.ok && details.data) {
      const wa = details.data.whatsapp;
      const statusStr = (wa.status || "").toLowerCase();
      const connected = statusStr === "connected" || statusStr === "ready";
      return {
        phase: connected
          ? "ready"
          : statusStr.includes("qr")
            ? "qr"
            : statusStr.includes("connecting") || statusStr.includes("reconnecting")
              ? "connecting"
              : statusStr.includes("logged_out")
                ? "logged_out"
                : "idle",
        qrDataUrl: wa.qrDataUrl,
        phone: wa.phone,
        error: null,
        persisted: Boolean(wa.phone || connected),
        savedAt: wa.lastConnectedAt,
        serverless: onVercel,
        pairingCode: wa.pairingCode,
      };
    }
  } catch {
    /* fallback to /health or heartbeat */
  }

  try {
    const health = await workerHealth();
    const wa = health.whatsapp ?? {};
    const connected = Boolean(wa.connected || health.whatsappConnection === "ready");
    let qrDataUrl = wa.qrDataUrl ?? null;
    let pairingCode = wa.pairingCode ?? null;
    let error = wa.error ?? null;
    try {
      const response = await workerFetch("/status");
      if (response.ok) {
        const json = (await response.json()) as {
          health?: { whatsapp?: Partial<ScanSnapshot> & { lastConnectedAt?: string | null } };
        };
        const full = json.health?.whatsapp;
        if (full) {
          qrDataUrl = full.qrDataUrl ?? qrDataUrl;
          pairingCode = full.pairingCode ?? pairingCode;
          error = full.error ?? error;
        }
      }
    } catch {
      /* health is enough to show linked */
    }
    return {
      phase: connected ? "ready" : ((wa.phase as ScanSnapshot["phase"]) ?? "idle"),
      qrDataUrl,
      phone: wa.phone ?? null,
      error,
      persisted: Boolean(wa.persisted || connected),
      savedAt: wa.lastConnectedAt ?? health.lastSuccessfulConnection ?? null,
      serverless: onVercel,
      pairingCode,
    };
  } catch {
    try {
      const hb = await loadWorkerHeartbeat();
      if (hb) {
        const ageMs = Date.now() - new Date(hb.updatedAt).getTime();
        if (ageMs < 60_000) {
          return {
            phase: hb.connected ? "ready" : ((hb.phase as ScanSnapshot["phase"]) || "idle"),
            qrDataUrl: hb.qrDataUrl,
            phone: hb.phone,
            error: hb.error,
            persisted: Boolean(hb.connected || hb.phase === "ready"),
            savedAt: hb.updatedAt,
            serverless: onVercel,
            pairingCode: hb.pairingCode,
          };
        }
      }
    } catch {
      /* fallback to empty */
    }
    const empty = emptySnapshot();
    if (workerIsAlive) {
      empty.error = "Worker process is running. Connecting to WhatsApp...";
      empty.phase = "connecting";
    }
    return empty;
  }
}

export async function startScanSession() {
  try {
    await workerFetch("/session/start", { method: "POST", body: "{}" });
  } catch {
    /* worker down */
  }
  return hydrateScanSnapshot();
}

export async function logoutScanSession() {
  try {
    await workerFetch("/session", { method: "DELETE" });
  } catch {
    /* worker down */
  }
  return hydrateScanSnapshot();
}
