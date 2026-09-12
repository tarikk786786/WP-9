import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { dataDir, migrateLegacyAuth } from "./paths.ts";
import { acquireWorkerLock, releaseWorkerLock } from "./singleton.ts";

const port = Number(process.env.PORT || process.env.WORKER_PORT || 8788);
const liveUrl = `http://127.0.0.1:${port}/health/live`;
const healthUrl = `http://127.0.0.1:${port}/health`;
const workerRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

let child: ChildProcess | null = null;
let stopping = false;
let booting = false;
let notReadySince = 0;
let lockHeld = false;
let crashCount = 0;

const BACKOFF_SCHEDULE = [2000, 4000, 8000, 16000, 30000, 60000];

function getBackoffMs() {
  const base = BACKOFF_SCHEDULE[Math.min(crashCount, BACKOFF_SCHEDULE.length - 1)];
  const jitter = base * (0.8 + Math.random() * 0.4);
  return Math.round(jitter);
}

async function portHealthy() {
  try {
    const res = await fetch(liveUrl, { signal: AbortSignal.timeout(2500) });
    return res.ok;
  } catch {
    return false;
  }
}

function tsxCliPath(): string | null {
  const repoRoot = path.resolve(workerRoot, "..", "..");
  const candidates = [
    path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs"),
    path.join(workerRoot, "node_modules", "tsx", "dist", "cli.mjs"),
  ];
  for (const c of candidates) {
    try {
      if (existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return null;
}

import { existsSync } from "node:fs";

async function boot() {
  if (stopping || booting || child) return;
  if (await portHealthy()) {
    console.log("[keep] WhatsApp worker already healthy on", port, "— not starting a second socket");
    return;
  }
  booting = true;
  try {
    const args = ["--import", "tsx", path.join(workerRoot, "src", "index.ts")];
    child = spawn(process.execPath, args, {
      cwd: workerRoot,
      stdio: ["ignore", "inherit", "inherit"],
      env: process.env,
      shell: false,
      windowsHide: true,
    });
    console.log(`[keep] WhatsApp worker pid ${child.pid}`);
    child.on("exit", (code, signal) => {
      child = null;
      if (stopping) return;
      crashCount += 1;
      const waitMs = getBackoffMs();
      console.error(`[keep] worker stopped (${code ?? signal ?? "exit"}). restarting in ${waitMs}ms (crash #${crashCount})`);
      void delay(waitMs).then(boot);
    });
  } finally {
    booting = false;
  }
}

async function healthTick() {
  try {
    // 1. Check HTTP Liveness (independent of WhatsApp)
    const liveRes = await fetch(liveUrl, { signal: AbortSignal.timeout(3000) });
    if (liveRes.ok) {
      crashCount = 0;
    } else if (!child && !stopping) {
      void boot();
      return;
    }

    // 2. Check WhatsApp state
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return;
    const json = (await res.json()) as {
      whatsappConnection?: string;
      whatsapp?: { connected?: boolean; phase?: string };
    };
    const phase = (json.whatsapp?.phase || json.whatsappConnection || "").toLowerCase();
    const isConnected = json.whatsapp?.connected === true || phase === "connected" || phase === "ready";
    const isAwaitingScan = phase.includes("qr") || phase.includes("scan");
    const isConnecting = phase.includes("connect");

    // As long as worker is connected or actively awaiting QR scan, it is in a healthy state
    if (isConnected || isAwaitingScan) {
      notReadySince = 0;
      return;
    }

    if (!notReadySince) notReadySince = Date.now();
    // Only restart if stuck in undefined/broken connecting state for > 6 minutes
    const maxStuckMs = isConnecting ? 360_000 : 300_000;
    if (Date.now() - notReadySince > maxStuckMs && child?.pid) {
      console.error("[keep] WhatsApp socket unresponsive (>6m) — gracefully restarting child worker");
      notReadySince = 0;
      child.kill("SIGTERM");
    }
  } catch {
    if (!child && !stopping) void boot();
  }
}

function shutdown() {
  stopping = true;
  child?.kill("SIGTERM");
  if (lockHeld) releaseWorkerLock(dataDir());
  setTimeout(() => process.exit(0), 1500);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("unhandledRejection", (reason) => {
  console.error("[keep] unhandledRejection (kept alive)", reason);
});
process.on("uncaughtException", (error) => {
  console.error("[keep] uncaughtException (kept alive)", error);
});

async function main() {
  migrateLegacyAuth();
  for (;;) {
    if (stopping) return;
    const lock = acquireWorkerLock(dataDir());
    if (!lock.ok) {
      console.log(`[keep] another supervisor holds the lock (pid ${lock.pid}). waiting — will not kill WhatsApp`);
      await delay(8000);
      continue;
    }
    lockHeld = true;
    console.log("[keep] exclusive lock taken. one WhatsApp socket only.");
    await boot();
    setInterval(() => {
      void healthTick();
    }, 12_000);
    return;
  }
}

void main();
