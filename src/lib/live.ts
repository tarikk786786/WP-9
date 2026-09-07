import { discoverLocalLlms, warmLocalModel } from "@/lib/local-llm";
import { hydrateScanSnapshot, startScanSession } from "@/lib/scan-session";
import { hasSavedSession, writeHeartbeat } from "@/lib/session-persist";
import { flushStore } from "@/lib/store";
import { getTarikProfile, scheduleProfileRefresh } from "@/lib/tarik-profile";
import type { LiveStatus } from "@/lib/types";
import { isServerlessDisk } from "@/lib/writable-dir";

const startedAt = new Date().toISOString();

const HINGLISH_ONLY = [
  {
    id: "hinglish",
    name: "Hinglish soft voice",
    kind: "hinglish" as const,
    online: true,
    live: true,
    models: ["always-live · calm Hinglish"],
  },
];

export async function getLiveStatus(): Promise<LiveStatus> {
  scheduleProfileRefresh();
  return {
    alive: true,
    startedAt,
    whatsapp: await hydrateScanSnapshot(),
    llms: isServerlessDisk() ? HINGLISH_ONLY : await discoverLocalLlms(),
    profile: getTarikProfile(),
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
  scheduleProfileRefresh();
  if (!isServerlessDisk()) {
    warmLocalModel();
  }
  setInterval(() => {
    void keepAliveTick();
  }, 8_000);
  setInterval(() => {
    scheduleProfileRefresh();
  }, 15 * 60 * 1000);
}
