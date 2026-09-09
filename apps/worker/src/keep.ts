import { spawn, type ChildProcess } from "node:child_process";
import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const port = Number(process.env.WORKER_PORT || 8788);
const healthUrl = `http://127.0.0.1:${port}/health`;

let child: ChildProcess | null = null;
let stopping = false;
let booting = false;
let notReadySince = 0;

function pidsOnPort(): number[] {
  try {
    const out = execFileSync("lsof", ["-ti", `tcp:${port}`], { encoding: "utf8" }).trim();
    return out
      .split(/\s+/)
      .map((row) => Number(row))
      .filter((pid) => Number.isFinite(pid) && pid > 0);
  } catch {
    return [];
  }
}

function freePort() {
  for (const pid of pidsOnPort()) {
    if (pid === process.pid) continue;
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  }
}

async function boot() {
  if (stopping || booting || child) return;
  booting = true;
  try {
    freePort();
    await delay(1500);
    if (stopping) return;
    child = spawn("npx", ["tsx", "src/index.ts"], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: process.env,
    });
    console.log(`[keep] WhatsApp worker pid ${child.pid}`);
    child.on("exit", (code, signal) => {
      child = null;
      if (stopping) return;
      console.error(`[keep] worker stopped (${code ?? signal ?? "exit"}). restarting`);
      void delay(2000).then(boot);
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
    const waitMs = connecting ? 90_000 : 60_000;
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

void boot();
setInterval(() => {
  void healthTick();
}, 12_000);
