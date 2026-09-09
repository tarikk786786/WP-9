import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { findSpecialPerson, SPECIAL_PEOPLE } from "@bot/engine";
import { dataDir } from "./paths.ts";

function aliasFile() {
  return path.join(dataDir(), "people-aliases.json");
}

function loadAliases(): Record<string, string> {
  try {
    if (!existsSync(aliasFile())) return {};
    return JSON.parse(readFileSync(aliasFile(), "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

function saveAliases(map: Record<string, string>) {
  mkdirSync(dataDir(), { recursive: true });
  writeFileSync(aliasFile(), JSON.stringify(map, null, 2));
}

export function rememberPersonJid(jid: string, personId: string) {
  if (!jid || !personId) return;
  const map = loadAliases();
  if (map[jid] === personId) return;
  map[jid] = personId;
  saveAliases(map);
}

export function personForChat(jid: string, fromName?: string) {
  const map = loadAliases();
  const mapped = map[jid] ? SPECIAL_PEOPLE.find((row) => row.id === map[jid]) : null;
  if (mapped) return mapped;
  const found = findSpecialPerson({
    jid,
    fromName,
    number: jid,
    aliases: Object.keys(map),
  });
  if (found) rememberPersonJid(jid, found.id);
  return found;
}
