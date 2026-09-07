import { defaultRules } from "@/lib/default-rules";
import { getDeployedRules, parseRules } from "@/lib/rules";
import type { BotRules, InboxMessage } from "@/lib/types";
import { persistRoots, readFirstExisting, writeToAllRoots } from "@/lib/writable-dir";

type StoreShape = {
  rules: BotRules;
  inbox: InboxMessage[];
  processedIds: string[];
  savedAt?: string;
};

const MAX_INBOX = 80;
const MAX_PROCESSED = 400;
const STORE_REL = "store.json";

const memory: StoreShape = {
  rules: getDeployedRules(),
  inbox: [],
  processedIds: [],
};

let loaded = false;

async function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await readFirstExisting(STORE_REL);
    if (!raw) {
      memory.rules = getDeployedRules();
      await persist();
      return;
    }
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    const rules = parseRules(parsed.rules);
    if (rules) memory.rules = rules;
    if (Array.isArray(parsed.inbox)) memory.inbox = parsed.inbox.slice(0, MAX_INBOX);
    if (Array.isArray(parsed.processedIds)) {
      memory.processedIds = parsed.processedIds.slice(0, MAX_PROCESSED);
    }
    memory.savedAt = parsed.savedAt;
  } catch {
    memory.rules = getDeployedRules();
  }
}

async function persist() {
  memory.savedAt = new Date().toISOString();
  try {
    await writeToAllRoots(STORE_REL, JSON.stringify(memory, null, 2));
  } catch {
    // Serverless may reject cwd; other roots still tried.
  }
}

export async function flushStore() {
  await ensureLoaded();
  await persist();
  return { savedAt: memory.savedAt ?? null, roots: persistRoots() };
}

export async function getRules(): Promise<BotRules> {
  await ensureLoaded();
  return memory.rules;
}

export async function saveRules(rules: BotRules): Promise<BotRules> {
  await ensureLoaded();
  memory.rules = rules;
  await persist();
  return memory.rules;
}

export async function resetRules(): Promise<BotRules> {
  return saveRules(defaultRules);
}

export async function getInbox(): Promise<InboxMessage[]> {
  await ensureLoaded();
  return memory.inbox;
}

export async function addInboxMessage(message: InboxMessage): Promise<InboxMessage> {
  await ensureLoaded();
  memory.inbox = [message, ...memory.inbox].slice(0, MAX_INBOX);
  await persist();
  return message;
}

export async function wasProcessed(id: string): Promise<boolean> {
  await ensureLoaded();
  return memory.processedIds.includes(id);
}

export async function markProcessed(id: string): Promise<void> {
  await ensureLoaded();
  memory.processedIds = [id, ...memory.processedIds.filter((item) => item !== id)].slice(
    0,
    MAX_PROCESSED,
  );
  await persist();
}
