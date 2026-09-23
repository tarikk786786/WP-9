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
    const raw = JSON.parse(readFileSync(aliasFile(), "utf8")) as Record<string, string>;
    // Strict sanitation: purge any key that does NOT belong to DAZy's verified phone/LID
    const sanitized: Record<string, string> = {};
    for (const [jid, personId] of Object.entries(raw)) {
      if (personId === "dazy") {
        const cleanDigits = jid.replace(/\D/g, "");
        if (cleanDigits.endsWith("7903956968") || jid.includes("232839253623024")) {
          sanitized[jid] = personId;
        }
      }
    }
    // If stale corrupted keys were present, re-save sanitized map
    if (Object.keys(sanitized).length !== Object.keys(raw).length) {
      saveAliases(sanitized);
    }
    return sanitized;
  } catch {
    return {};
  }
}

function saveAliases(map: Record<string, string>) {
  try {
    mkdirSync(dataDir(), { recursive: true });
    writeFileSync(aliasFile(), JSON.stringify(map, null, 2));
  } catch {
    /* non-fatal */
  }
}

export function rememberPersonJid(jid: string, personId: string) {
  if (!jid || !personId) return;
  // Strict check: ONLY remember DAZy if JID actually belongs to DAZy
  if (personId === "dazy") {
    const cleanDigits = jid.replace(/\D/g, "");
    if (!cleanDigits.endsWith("7903956968") && !jid.includes("232839253623024")) {
      return;
    }
  }
  const map = loadAliases();
  if (map[jid] === personId) return;
  map[jid] = personId;
  saveAliases(map);
}

export function personForChat(jid: string, fromName?: string, phoneHints?: string) {
  const map = loadAliases();
  const mapped = map[jid] ? SPECIAL_PEOPLE.find((row) => row.id === map[jid]) : null;
  if (mapped) return mapped;
  const found = findSpecialPerson({
    jid,
    fromName,
    number: phoneHints || jid,
  });
  if (found) rememberPersonJid(jid, found.id);
  return found;
}
