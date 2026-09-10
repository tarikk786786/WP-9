import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workerDir = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const repoRoot = path.resolve(workerDir, "..", "..");
const port = Number(process.env.WORKER_PORT || 8788);
const healthUrl = `http://127.0.0.1:${port}/health`;
const tunnelUrlFile = path.join(repoRoot, "tools", "tunnel-url.txt");

function loadDotEnv() {
  const file = path.join(repoRoot, ".env");
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const cut = line.indexOf("=");
    if (cut < 1) continue;
    const key = line.slice(0, cut).trim();
    let value = line.slice(cut + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotEnv();

let worker: ChildProcess | null = null;
let tunnel: ChildProcess | null = null;
let lastTunnelUrl = existsSync(tunnelUrlFile) ? readFileSync(tunnelUrlFile, "utf8").trim() : "";
let stopping = false;
let tunnelFails = 0;
let syncingUrl = "";

function cloudflaredBin() {
  const fromEnv = process.env.CLOUDFLARED_BIN?.trim();
  const candidates = [
    fromEnv,
    path.join(repoRoot, "tools", "bin", "cloudflared"),
    path.join(workerDir, "cloudflared.bin"),
    "cloudflared",
  ].filter((row): row is string => Boolean(row));
  for (const candidate of candidates) {
    if (candidate === "cloudflared" || existsSync(candidate)) return candidate;
  }
  return "cloudflared";
}

async function workerHealthy() {
  try {
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return false;
    const json = (await res.json()) as { whatsapp?: { connected?: boolean; phase?: string } };
    return json.whatsapp?.connected === true || json.whatsapp?.phase === "ready" || json.whatsapp?.phase === "qr";
  } catch {
    return false;
  }
}

function startWorker() {
  if (stopping || pidAlive(worker?.pid)) return;
  worker = null;
  console.log("[live] starting WhatsApp worker");
  worker = spawn("npm", ["run", "worker"], {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
    shell: true,
  });
  worker.on("exit", () => {
    worker = null;
    if (!stopping) {
      console.error("[live] worker exited — bringing it back");
      setTimeout(startWorker, 2500);
    }
  });
}

function pidAlive(pid?: number) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function rememberTunnelUrl(text: string) {
  const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
  if (!match) return;
  const url = match[0];
  if (url === lastTunnelUrl) return;
  lastTunnelUrl = url;
  tunnelFails = 0;
  try {
    writeFileSync(tunnelUrlFile, `${url}\n`);
  } catch {
    /* ignore */
  }
  console.log("[live] public worker URL", url);
  void syncPublicWorkerUrl(url);
}

function syncPublicWorkerUrl(url: string) {
  if (!process.env.VERCEL_TOKEN || syncingUrl === url) return;
  syncingUrl = url;
  const child = spawn("bash", [path.join(repoRoot, "scripts", "sync-worker-url.sh"), url], {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });
  child.on("exit", (code) => {
    if (code !== 0) console.error("[live] Vercel worker URL sync failed", code);
  });
}

async function publicTunnelHealthy() {
  if (!lastTunnelUrl) return false;
  try {
    const res = await fetch(`${lastTunnelUrl.replace(/\/$/, "")}/health`, {
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function killTunnel() {
  const current = tunnel;
  tunnel = null;
  try {
    current?.kill("SIGTERM");
  } catch {
    /* ignore */
  }
}

function startTunnel() {
  if (stopping || pidAlive(tunnel?.pid)) return;
  tunnel = null;
  const token = process.env.CLOUDFLARE_TUNNEL_TOKEN?.trim();
  const bin = cloudflaredBin();
  const args = token
    ? ["tunnel", "--no-autoupdate", "run", "--token", token]
    : ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${port}`];
  console.log("[live] starting cloudflared");
  tunnel = spawn(bin, args, {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  tunnel.stdout?.on("data", (buf) => rememberTunnelUrl(String(buf)));
  tunnel.stderr?.on("data", (buf) => {
    const text = String(buf);
    rememberTunnelUrl(text);
    if (/ERR |error=/i.test(text) && /Serve tunnel|failed to/i.test(text)) {
      /* keep.ts already logs; avoid flooding */
    }
  });
  tunnel.on("exit", () => {
    tunnel = null;
    if (!stopping) {
      console.error("[live] tunnel exited — bringing it back");
      setTimeout(startTunnel, 4000);
    }
  });
}

async function tick() {
  if (stopping) return;
  if (!pidAlive(worker?.pid)) worker = null;
  if (!(await workerHealthy())) startWorker();
  if (!pidAlive(tunnel?.pid)) {
    tunnel = null;
    startTunnel();
    return;
  }
  const localOk = await workerHealthy();
  if (!localOk) return;
  const publicOk = await publicTunnelHealthy();
  if (publicOk) {
    tunnelFails = 0;
    return;
  }
  tunnelFails += 1;
  if (tunnelFails < 2) return;
  console.error("[live] public tunnel dead while worker is up — restarting cloudflared");
  tunnelFails = 0;
  killTunnel();
  startTunnel();
}

function shutdown() {
  stopping = true;
  worker?.kill("SIGTERM");
  tunnel?.kill("SIGTERM");
  setTimeout(() => process.exit(0), 1500);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("unhandledRejection", (reason) => {
  console.error("[live] unhandledRejection (kept alive)", reason);
});
process.on("uncaughtException", (error) => {
  console.error("[live] uncaughtException (kept alive)", error);
});

console.log("[live] always-on guard: WhatsApp replies + tunnel");
void tick();
setInterval(() => {
  void tick();
}, 12_000);
