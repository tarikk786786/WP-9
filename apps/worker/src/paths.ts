import { existsSync, mkdirSync, cpSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workerRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

export function loadDotEnv() {
  const repoRoot = path.resolve(workerRoot, "..", "..");
  const candidates = [
    path.join(repoRoot, ".env"),
    path.join(workerRoot, ".env"),
    path.resolve(process.cwd(), ".env"),
  ];
  for (const file of candidates) {
    if (existsSync(file)) {
      if (typeof process.loadEnvFile === "function") {
        try {
          process.loadEnvFile(file);
          return;
        } catch {
          /* fallback to manual parse */
        }
      }
      try {
        const content = readFileSync(file, "utf8");
        for (const raw of content.split("\n")) {
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
        return;
      } catch {
        /* ignore */
      }
    }
  }
}

loadDotEnv();


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
