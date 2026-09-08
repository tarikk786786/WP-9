import { workerFetch } from "@/lib/worker-client";
import type { ScanSnapshot } from "@/lib/types";

function emptySnapshot(): ScanSnapshot {
  return {
    phase: "idle",
    qrDataUrl: null,
    phone: null,
    error: "Worker offline. Run npm run worker.",
    persisted: false,
    savedAt: null,
    serverless: Boolean(process.env.VERCEL),
    pairingCode: null,
  };
}

export async function hydrateScanSnapshot(): Promise<ScanSnapshot> {
  try {
    const response = await workerFetch("/status");
    const json = (await response.json()) as {
      health?: { whatsapp?: Partial<ScanSnapshot> & { lastConnectedAt?: string | null } };
    };
    const wa = json.health?.whatsapp;
    if (!wa) return emptySnapshot();
    return {
      phase: (wa.phase as ScanSnapshot["phase"]) ?? "idle",
      qrDataUrl: wa.qrDataUrl ?? null,
      phone: wa.phone ?? null,
      error: wa.error ?? null,
      persisted: Boolean(wa.persisted),
      savedAt: wa.lastConnectedAt ?? null,
      serverless: Boolean(process.env.VERCEL),
      pairingCode: wa.pairingCode ?? null,
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
