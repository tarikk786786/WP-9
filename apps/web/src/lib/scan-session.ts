import { loadWorkerHeartbeat } from "@bot/database";
import { workerFetch, workerHealth, workerLooksLocal } from "@/lib/worker-client";
import type { ScanSnapshot } from "@/lib/types";

function emptySnapshot(): ScanSnapshot {
  const onVercel = Boolean(process.env.VERCEL);
  const localUrl = workerLooksLocal();
  return {
    phase: "idle",
    qrDataUrl: null,
    phone: null,
    error: onVercel && localUrl
      ? "Vercel cannot reach a localhost worker directly. Set WORKER_API_URL to your public tunnel or worker host URL."
      : "Worker is offline. Run 'npm run worker' to start.",
    persisted: false,
    savedAt: null,
    serverless: onVercel,
    pairingCode: null,
  };
}

export async function hydrateScanSnapshot(): Promise<ScanSnapshot> {
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
      serverless: Boolean(process.env.VERCEL),
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
            serverless: Boolean(process.env.VERCEL),
            pairingCode: hb.pairingCode,
          };
        }
      }
    } catch {
      /* fallback to empty */
    }
    return emptySnapshot();
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
