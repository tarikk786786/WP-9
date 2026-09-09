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
      ? "Vercel localhost worker tak nahi pahunchta. WORKER_API_URL pe public worker URL do."
      : "Worker offline. Run npm run worker.",
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
