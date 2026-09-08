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

export function getAuthDir() {
  return writablePath("baileys-auth");
}
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

export function credsJsonIsLinked(raw: string): boolean {
  try {
    const creds = JSON.parse(raw) as { registered?: boolean; me?: { id?: string } };
    return creds.registered === true || Boolean(creds.me?.id);
  } catch {
    return false;
  }
}

function archiveIsLinked(archive: SessionArchive): boolean {
  try {
    return credsJsonIsLinked(
      Buffer.from(archive.files["creds.json"], "base64").toString("utf8"),
    );
  } catch {
    return false;
  }
}

export function parseSessionArchive(raw: unknown): SessionArchive | null {
  try {
    const parsed = (
      typeof raw === "string" ? JSON.parse(raw) : raw
    ) as Partial<SessionArchive>;
    if (!parsed?.files || typeof parsed.files !== "object") return null;
    if (typeof parsed.files["creds.json"] !== "string" || !parsed.files["creds.json"]) {
      return null;
    }
    const files: Record<string, string> = {};
    for (const [rel, encoded] of Object.entries(parsed.files)) {
      if (!isSafeRelPath(rel) || typeof encoded !== "string") continue;
      files[rel] = encoded;
    }
    if (!files["creds.json"]) return null;
    return {
      files,
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
  return parseSessionArchive(fromEnv);
}

export async function readSessionArchive(): Promise<SessionArchive | null> {
  const disk = await readFirstExisting(ARCHIVE_REL);
  if (disk) {
    const parsed = parseSessionArchive(disk);
    if (parsed) return parsed;
  }
  return parseEnvArchive();
}

export async function hasSavedSession(): Promise<boolean> {
  for (const root of persistRoots()) {
    try {
      const raw = await readFile(path.join(root, "baileys-auth", "creds.json"), "utf8");
      if (credsJsonIsLinked(raw)) return true;
    } catch {
      // next root
    }
  }
  const archive = await readSessionArchive();
  return Boolean(archive && archiveIsLinked(archive));
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
  if (archive && archiveIsLinked(archive)) {
    return { phone: archive.phone ?? (await phoneFromCreds()), savedAt: archive.savedAt };
  }
  const phone = await phoneFromCreds();
  return { phone, savedAt: null };
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
  if (!(await hasSavedSession())) return false;
  if (existsSync(path.join(getAuthDir(), "creds.json"))) {
    try {
      const raw = await readFile(path.join(getAuthDir(), "creds.json"), "utf8");
      if (credsJsonIsLinked(raw)) return true;
    } catch {
      // fall through and copy
    }
  }
  const existing = firstExistingPath("baileys-auth", "creds.json");
  if (existsSync(existing)) {
    try {
      const raw = await readFile(existing, "utf8");
      if (credsJsonIsLinked(raw)) {
        const names = await walkFiles(path.dirname(existing));
        const files: Record<string, string> = {};
        for (const rel of names) {
          const buf = await readFile(path.join(path.dirname(existing), rel));
          files[rel] = buf.toString("base64");
        }
        await writeAuthFiles(files);
        return true;
      }
    } catch {
      // try archive
    }
  }
  const archive = await readSessionArchive();
  if (!archive || !archiveIsLinked(archive)) return false;
  await writeAuthFiles(archive.files);
  return true;
}

export async function persistSavedSession(phone: string | null): Promise<SessionArchive | null> {
  let sourceDir = getAuthDir();
  if (!existsSync(path.join(sourceDir, "creds.json"))) {
    const found = firstExistingPath("baileys-auth", "creds.json");
    if (existsSync(found)) sourceDir = path.dirname(found);
  }
  const names = await walkFiles(sourceDir);
  if (!names.includes("creds.json")) return readSessionArchive();
  let linked = false;
  try {
    linked = credsJsonIsLinked(await readFile(path.join(sourceDir, "creds.json"), "utf8"));
  } catch {
    linked = false;
  }
  if (!linked) return null;
  const files: Record<string, string> = {};
  for (const rel of names) {
    const buf = await readFile(path.join(sourceDir, rel));
    files[rel] = buf.toString("base64");
  }
  const archive: SessionArchive = {
    files,
    phone: phone ?? (await phoneFromCreds()),
    savedAt: new Date().toISOString(),
  };
  await writeToAllRoots(ARCHIVE_REL, JSON.stringify(archive));
  await writeAuthFiles(files);
  return archive;
}

export async function exportSessionArchive(): Promise<SessionArchive | null> {
  const phone = (await getSavedPhone()).phone;
  const fresh = await persistSavedSession(phone);
  return fresh ?? readSessionArchive();
}

export async function importSessionArchive(raw: unknown): Promise<boolean> {
  const archive = parseSessionArchive(raw);
  if (!archive || !archiveIsLinked(archive)) return false;
  await writeAuthFiles(archive.files);
  await writeToAllRoots(ARCHIVE_REL, JSON.stringify(archive));
  return existsSync(path.join(getAuthDir(), "creds.json"));
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
