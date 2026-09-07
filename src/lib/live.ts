import { discoverLocalLlms, warmLocalModel } from "@/lib/local-llm";
import { hydrateScanSnapshot, startScanSession } from "@/lib/scan-session";
import { hasSavedSession, writeHeartbeat } from "@/lib/session-persist";
import { flushStore } from "@/lib/store";
import { refreshTarikProfile } from "@/lib/tarik-profile";
import type { LiveStatus } from "@/lib/types";
import { isServerlessDisk } from "@/lib/writable-dir";

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
  await writeHeartbeat();
  await flushStore();
  if (isServerlessDisk()) return;
  const snapshot = await hydrateScanSnapshot();
  const saved = await hasSavedSession();
  if (saved && snapshot.phase !== "ready") {
    if (snapshot.phase === "qr") return;
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
  }, 8_000);
  setInterval(() => {
    void refreshTarikProfile();
  }, 15 * 60 * 1000);
}
