import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { writablePath } from "@/lib/writable-dir";

export const AUTH_DIR = writablePath("baileys-auth");
const ARCHIVE_PATH = writablePath("whatsapp-session.json");

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

export async function readSessionArchive(): Promise<SessionArchive | null> {
  try {
    const raw = await readFile(ARCHIVE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<SessionArchive>;
    if (!parsed.files || typeof parsed.files !== "object") return null;
    if (!parsed.files["creds.json"]) return null;
    return {
      files: parsed.files,
      phone: typeof parsed.phone === "string" ? parsed.phone : null,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date().toISOString(),
    };
  } catch {
    return parseEnvArchive();
  }
}

function parseEnvArchive(): SessionArchive | null {
  const fromEnv = process.env.WHATSAPP_AUTH_JSON;
  if (!fromEnv) return null;
  try {
    const parsed = JSON.parse(fromEnv) as Partial<SessionArchive>;
    if (!parsed.files || typeof parsed.files !== "object" || !parsed.files["creds.json"]) {
      return null;
    }
    return {
      files: parsed.files,
      phone: typeof parsed.phone === "string" ? parsed.phone : null,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function hasSavedSession(): Promise<boolean> {
  if (existsSync(path.join(AUTH_DIR, "creds.json"))) return true;
  return Boolean(await readSessionArchive());
}

export async function getSavedPhone(): Promise<{ phone: string | null; savedAt: string | null }> {
  if (existsSync(path.join(AUTH_DIR, "creds.json"))) {
    const archive = await readSessionArchive();
    return { phone: archive?.phone ?? null, savedAt: archive?.savedAt ?? null };
  }
  const archive = await readSessionArchive();
  return { phone: archive?.phone ?? null, savedAt: archive?.savedAt ?? null };
}

export async function restoreSavedSession(): Promise<boolean> {
  if (existsSync(path.join(AUTH_DIR, "creds.json"))) return true;
  const archive = await readSessionArchive();
  if (!archive) return false;
  await mkdir(AUTH_DIR, { recursive: true });
  for (const [rel, encoded] of Object.entries(archive.files)) {
    if (!isSafeRelPath(rel) || typeof encoded !== "string") continue;
    const dest = path.join(AUTH_DIR, rel);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, Buffer.from(encoded, "base64"));
  }
  return existsSync(path.join(AUTH_DIR, "creds.json"));
}

export async function persistSavedSession(phone: string | null): Promise<void> {
  const names = await walkFiles(AUTH_DIR);
  if (!names.includes("creds.json")) return;
  const files: Record<string, string> = {};
  for (const rel of names) {
    const buf = await readFile(path.join(AUTH_DIR, rel));
    files[rel] = buf.toString("base64");
  }
  const archive: SessionArchive = {
    files,
    phone,
    savedAt: new Date().toISOString(),
  };
  await mkdir(path.dirname(ARCHIVE_PATH), { recursive: true });
  await writeFile(ARCHIVE_PATH, JSON.stringify(archive), "utf8");
}

export async function clearSavedSession(): Promise<void> {
  await rm(AUTH_DIR, { recursive: true, force: true });
  await rm(ARCHIVE_PATH, { force: true });
}
