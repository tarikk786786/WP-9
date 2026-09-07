import { existsSync } from "node:fs";
import { discoverLocalLlms, warmLocalModel } from "@/lib/local-llm";
import { getScanSnapshot, startScanSession } from "@/lib/scan-session";
import { refreshTarikProfile } from "@/lib/tarik-profile";
import type { LiveStatus } from "@/lib/types";
import { writablePath } from "@/lib/writable-dir";

const AUTH_DIR = writablePath("baileys-auth");

const startedAt = new Date().toISOString();

export async function getLiveStatus(): Promise<LiveStatus> {
  return {
    alive: true,
    startedAt,
    whatsapp: getScanSnapshot(),
    llms: await discoverLocalLlms(),
  };
}

export async function keepAliveTick() {
  const snapshot = getScanSnapshot();
  const hasSession = existsSync(writablePath("baileys-auth", "creds.json"));
  if (hasSession && snapshot.phase !== "ready" && snapshot.phase !== "qr") {
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
