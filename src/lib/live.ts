import { existsSync } from "node:fs";
import path from "node:path";
import { discoverLocalLlms, warmLocalModel } from "@/lib/local-llm";
import { getScanSnapshot, startScanSession } from "@/lib/scan-session";
import type { LiveStatus } from "@/lib/types";

const AUTH_DIR = path.join(process.cwd(), "data", "baileys-auth");

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
  const hasSession = existsSync(path.join(AUTH_DIR, "creds.json"));
  if (hasSession && snapshot.phase !== "ready" && snapshot.phase !== "qr") {
    await startScanSession();
  }
}

export function startLiveLoop() {
  const globalRef = globalThis as typeof globalThis & { __relayLive?: boolean };
  if (globalRef.__relayLive) return;
  globalRef.__relayLive = true;
  void keepAliveTick();
  warmLocalModel();
  setInterval(() => {
    void keepAliveTick();
  }, 15_000);
}
