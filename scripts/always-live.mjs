import { spawn } from "node:child_process";

const port = process.env.PORT || "43217";
const host = "127.0.0.1";
const origin = `http://${host}:${port}`;

function startNext() {
  const child = spawn(
    process.execPath,
    ["./node_modules/next/dist/bin/next", "dev", "--port", port, "--hostname", host],
    { stdio: "inherit", cwd: process.cwd(), env: process.env },
  );
  child.on("exit", (code) => {
    console.log(`[always-live] Next exited ${code ?? "null"}. Restarting in 2s…`);
    setTimeout(startNext, 2000);
  });
  return child;
}

async function poke() {
  try {
    await fetch(`${origin}/api/live`, { signal: AbortSignal.timeout(8000) });
  } catch {
    // Next may still be booting; the next tick retries.
  }
}

startNext();
setTimeout(() => {
  void poke();
}, 2500);
setInterval(() => {
  void poke();
}, 8000);

console.log(`[always-live] Tarik desk on ${origin} — login + rules stay on disk.`);
