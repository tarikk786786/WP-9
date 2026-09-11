import { existsSync, mkdirSync, cpSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workerRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

export function authDir() {
  const fromEnv = process.env.BAILEYS_AUTH_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  if (existsSync("/app/data")) return path.resolve("/app/data/baileys-auth");
  if (existsSync("/opt/wp9/data")) return path.resolve("/opt/wp9/data/baileys-auth");
  return path.resolve(path.join(workerRoot, "data", "baileys-auth"));
}

export function dataDir() {
  return path.dirname(authDir());
}

export function migrateLegacyAuth() {
  const dest = authDir();
  mkdirSync(dest, { recursive: true });
  const destCreds = path.join(dest, "creds.json");
  if (existsSync(destCreds)) return dest;
  const candidates = [
    path.join(process.cwd(), "data", "baileys-auth"),
    path.join(workerRoot, "data", "baileys-auth"),
  ];
  for (const legacy of candidates) {
    if (path.resolve(legacy) === path.resolve(dest)) continue;
    if (!existsSync(path.join(legacy, "creds.json"))) continue;
    cpSync(legacy, dest, { recursive: true });
    break;
  }
  return dest;
}
