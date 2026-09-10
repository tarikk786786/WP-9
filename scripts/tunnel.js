import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const binPath = path.resolve(process.cwd(), "tools", "bin", "cloudflared.exe");

if (!fs.existsSync(binPath)) {
  console.error("cloudflared binary not found at", binPath);
  process.exit(1);
}

console.log("[tunnel] Starting Cloudflare Tunnel for WhatsApp worker on http://127.0.0.1:8788...");

const child = spawn(binPath, ["tunnel", "--url", "http://127.0.0.1:8788"], {
  stdio: ["ignore", "pipe", "pipe"],
});

let foundUrl = false;

function parseLine(line) {
  const match = line.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
  if (match && !foundUrl) {
    foundUrl = true;
    const url = match[0];
    console.log("\n" + "=".repeat(68));
    console.log("  >>> PUBLIC WORKER TUNNEL ONLINE <<<");
    console.log(`  Tunnel URL: ${url}`);
    console.log("\n  Set this in your Vercel Project Settings > Environment Variables:");
    console.log(`  WORKER_API_URL = ${url}`);
    console.log("=".repeat(68) + "\n");
  }
}

child.stdout.on("data", (data) => {
  const text = data.toString();
  text.split(/\r?\n/).forEach(parseLine);
});

child.stderr.on("data", (data) => {
  const text = data.toString();
  text.split(/\r?\n/).forEach(parseLine);
});

child.on("exit", (code) => {
  console.log(`[tunnel] Process exited with code ${code}`);
});

process.on("SIGINT", () => {
  child.kill();
  process.exit(0);
});
process.on("SIGTERM", () => {
  child.kill();
  process.exit(0);
});
