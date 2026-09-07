import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  firstExistingPath,
  persistRoots,
  readFirstExisting,
  writablePath,
  writeToAllRoots,
} from "@/lib/writable-dir";

export const AUTH_DIR = writablePath("baileys-auth");
const ARCHIVE_REL = "whatsapp-session.json";

export type SessionArchive = {
  files: Record<string, string>;
  phone: string | null;
  savedAt: string;
};

function isSafeRelPath(rel: string) {
  return Boolean(rel) && !rel.includes("..") && !path.isAbsolute(rel);
}

async function walkFiles(dir: string, prefix = ""): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (!isSafeRelPath(rel)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(full, rel)));
    } else if (entry.isFile()) {
      files.push(rel);
    }
  }
  return files;
}

function parseArchive(raw: string): SessionArchive | null {
  try {
    const parsed = JSON.parse(raw) as Partial<SessionArchive>;
    if (!parsed.files || typeof parsed.files !== "object") return null;
    if (!parsed.files["creds.json"]) return null;
    return {
      files: parsed.files,
      phone: typeof parsed.phone === "string" ? parsed.phone : null,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function parseEnvArchive(): SessionArchive | null {
  const fromEnv = process.env.WHATSAPP_AUTH_JSON;
  if (!fromEnv) return null;
  return parseArchive(fromEnv);
}

export async function readSessionArchive(): Promise<SessionArchive | null> {
  const disk = await readFirstExisting(ARCHIVE_REL);
  if (disk) {
    const parsed = parseArchive(disk);
    if (parsed) return parsed;
  }
  return parseEnvArchive();
}

export async function hasSavedSession(): Promise<boolean> {
  for (const root of persistRoots()) {
    if (existsSync(path.join(root, "baileys-auth", "creds.json"))) return true;
  }
  return Boolean(await readSessionArchive());
}

async function phoneFromCreds(): Promise<string | null> {
  for (const root of persistRoots()) {
    try {
      const raw = await readFile(path.join(root, "baileys-auth", "creds.json"), "utf8");
      const creds = JSON.parse(raw) as { me?: { id?: string } };
      const id = creds.me?.id;
      if (typeof id === "string") return id.split(":")[0] ?? id;
    } catch {
      // try next
    }
  }
  return null;
}

export async function getSavedPhone(): Promise<{ phone: string | null; savedAt: string | null }> {
  const archive = await readSessionArchive();
  const phone = archive?.phone ?? (await phoneFromCreds());
  return { phone, savedAt: archive?.savedAt ?? null };
}

async function writeAuthFiles(files: Record<string, string>) {
  for (const root of persistRoots()) {
    const dir = path.join(root, "baileys-auth");
    try {
      await mkdir(dir, { recursive: true });
      for (const [rel, encoded] of Object.entries(files)) {
        if (!isSafeRelPath(rel) || typeof encoded !== "string") continue;
        const dest = path.join(dir, rel);
        await mkdir(path.dirname(dest), { recursive: true });
        await writeFile(dest, Buffer.from(encoded, "base64"));
      }
    } catch {
      // next root
    }
  }
}

export async function restoreSavedSession(): Promise<boolean> {
  if (existsSync(path.join(AUTH_DIR, "creds.json"))) return true;
  const existing = firstExistingPath("baileys-auth", "creds.json");
  if (existsSync(existing)) {
    const names = await walkFiles(path.dirname(existing));
    const files: Record<string, string> = {};
    for (const rel of names) {
      const buf = await readFile(path.join(path.dirname(existing), rel));
      files[rel] = buf.toString("base64");
    }
    await writeAuthFiles(files);
    return existsSync(path.join(AUTH_DIR, "creds.json"));
  }
  const archive = await readSessionArchive();
  if (!archive) return false;
  await writeAuthFiles(archive.files);
  return existsSync(path.join(AUTH_DIR, "creds.json"));
}

export async function persistSavedSession(phone: string | null): Promise<void> {
  let sourceDir = AUTH_DIR;
  if (!existsSync(path.join(sourceDir, "creds.json"))) {
    const found = firstExistingPath("baileys-auth", "creds.json");
    if (existsSync(found)) sourceDir = path.dirname(found);
  }
  const names = await walkFiles(sourceDir);
  if (!names.includes("creds.json")) return;
  const files: Record<string, string> = {};
  for (const rel of names) {
    const buf = await readFile(path.join(sourceDir, rel));
    files[rel] = buf.toString("base64");
  }
  const archive: SessionArchive = {
    files,
    phone,
    savedAt: new Date().toISOString(),
  };
  await writeToAllRoots(ARCHIVE_REL, JSON.stringify(archive));
  await writeAuthFiles(files);
}

export async function clearSavedSession(): Promise<void> {
  for (const root of persistRoots()) {
    await rm(path.join(root, "baileys-auth"), { recursive: true, force: true });
    await rm(path.join(root, ARCHIVE_REL), { force: true });
  }
}

export async function writeHeartbeat() {
  await writeToAllRoots(
    "heartbeat.json",
    JSON.stringify({ at: new Date().toISOString(), alive: true }),
  );
}
