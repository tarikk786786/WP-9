import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { dataDir, migrateLegacyAuth } from "./paths.ts";
import { acquireWorkerLock, releaseWorkerLock } from "./singleton.ts";

const port = Number(process.env.WORKER_PORT || 8788);
const healthUrl = `http://127.0.0.1:${port}/health`;
const workerRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

let child: ChildProcess | null = null;
let stopping = false;
let booting = false;
let notReadySince = 0;
let lockHeld = false;

async function portHealthy() {
  try {
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(2500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function boot() {
  if (stopping || booting || child) return;
  if (await portHealthy()) {
    console.log("[keep] WhatsApp worker already healthy on", port, "— not starting a second socket");
    return;
  }
  booting = true;
  try {
    child = spawn("npx", ["tsx", "src/index.ts"], {
      cwd: workerRoot,
      stdio: "inherit",
      env: process.env,
    });
    console.log(`[keep] WhatsApp worker pid ${child.pid}`);
    child.on("exit", (code, signal) => {
      child = null;
      if (stopping) return;
      console.error(`[keep] worker stopped (${code ?? signal ?? "exit"}). restarting`);
      void delay(2500).then(boot);
    });
  } finally {
    booting = false;
  }
}

async function healthTick() {
  try {
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(4000) });
    const json = (await res.json()) as {
      whatsappConnection?: string;
      whatsapp?: { connected?: boolean; phase?: string };
    };
    const ready = json.whatsapp?.connected === true || json.whatsappConnection === "ready";
    const waitingScan = json.whatsappConnection === "qr" || json.whatsapp?.phase === "qr";
    const connecting = json.whatsappConnection === "connecting" || json.whatsapp?.phase === "connecting";
    if (ready || waitingScan) {
      notReadySince = 0;
      return;
    }
    if (!notReadySince) notReadySince = Date.now();
    const waitMs = connecting ? 120_000 : 90_000;
    if (Date.now() - notReadySince > waitMs && child?.pid) {
      console.error("[keep] WhatsApp stayed down — restarting worker");
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
