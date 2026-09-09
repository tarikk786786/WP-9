import { spawn, type ChildProcess } from "node:child_process";
import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const port = Number(process.env.WORKER_PORT || 8788);
const healthUrl = `http://127.0.0.1:${port}/health`;

let child: ChildProcess | null = null;
let stopping = false;
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

function boot() {
  if (stopping) return;
  freePort();
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
    if (ready || waitingScan) {
      notReadySince = 0;
      return;
    }
    if (!notReadySince) notReadySince = Date.now();
    if (Date.now() - notReadySince > 45_000 && child?.pid) {
      console.error("[keep] WhatsApp stayed down — restarting worker");
      notReadySince = 0;
      child.kill("SIGTERM");
    }
  } catch {
    if (!child && !stopping) boot();
  }
}

function shutdown() {
  stopping = true;
  child?.kill("SIGTERM");
  setTimeout(() => process.exit(0), 1500);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

boot();
setInterval(() => {
  void healthTick();
}, 12_000);
