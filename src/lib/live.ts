import { discoverLocalLlms, warmLocalModel } from "@/lib/local-llm";
import { hydrateScanSnapshot, startScanSession } from "@/lib/scan-session";
import { hasSavedSession } from "@/lib/session-persist";
import { refreshTarikProfile } from "@/lib/tarik-profile";
import type { LiveStatus } from "@/lib/types";

const startedAt = new Date().toISOString();

export async function getLiveStatus(): Promise<LiveStatus> {
  return {
    alive: true,
    startedAt,
    whatsapp: await hydrateScanSnapshot(),
    llms: await discoverLocalLlms(),
  };
}

export async function keepAliveTick() {
  const snapshot = await hydrateScanSnapshot();
  if ((await hasSavedSession()) && snapshot.phase !== "ready" && snapshot.phase !== "qr") {
    await startScanSession();
  }
}

export function startLiveLoop() {
  const globalRef = globalThis as typeof globalThis & { __relayLive?: boolean };
  if (globalRef.__relayLive) return;
  globalRef.__relayLive = true;
  void keepAliveTick();
  void refreshTarikProfile();
  warmLocalModel();
  setInterval(() => {
    void keepAliveTick();
  }, 15_000);
  setInterval(() => {
    void refreshTarikProfile();
  }, 15 * 60 * 1000);
}
