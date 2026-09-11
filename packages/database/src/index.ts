import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  defaultAutomationRules,
  defaultBotSettings,
  defaultFaqs,
  type AutomationRule,
  type BotSettings,
  type Faq,
} from "@bot/shared";

export type Customer = {
  id: string;
  whatsapp_number: string;
  name: string;
  profile_name: string;
  language: string;
  status: string;
  metadata: Record<string, unknown>;
  last_seen_at: string;
};

export type Conversation = {
  id: string;
  user_id: string;
  chat_id: string;
  status: "bot" | "waiting_human" | "human" | "paused" | "closed";
  assigned_agent_id: string | null;
  current_intent: string | null;
  ai_enabled: boolean;
  last_message_at: string;
};

export type StoredMessage = {
  id: string;
  conversation_id: string;
  whatsapp_message_id: string;
  direction: "in" | "out";
  message_type: string;
  text: string;
  media_reference: string | null;
  ai_generated: boolean;
  intent: string | null;
  created_at: string;
};

export type LogEvent = {
  id: string;
  level: "info" | "warn" | "error";
  source: string;
  message: string;
  created_at: string;
};

export interface ResponseCommitRecord {
  responseId: string;
  turnId: string;
  chatId: string;
  status: "CREATED" | "RESERVED" | "COMMITTED" | "SENDING" | "SENT" | "RETRY_PENDING" | "DEAD_LETTER";
  finalText: string;
  intent?: string;
  modelId?: string;
  plan?: Record<string, unknown>;
  createdAt?: number;
  committedAt?: number;
  sentAt?: number;
  attemptCount?: number;
  lastError?: string;
}

export interface OutboxDbRecord {
  responseId: string;
  turnId?: string;
  chatId: string;
  text: string;
  status: "pending" | "sending" | "sent" | "failed" | "dead_letter";
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  sentAt?: number;
  lastError?: string;
}

type Memory = {
  customers: Customer[];
  conversations: Conversation[];
  messages: StoredMessage[];
  faqs: Faq[];
  rules: AutomationRule[];
  settings: BotSettings;
  processed: Set<string>;
  logs: LogEvent[];
  authFiles: Record<string, string>;
  knowledge: Array<{ id: string; title: string; content: string; enabled: boolean }>;
  dedup: Map<string, { messageId: string; eventId: string; chatId: string; senderId: string; contentHash: string; normalizedHash: string; createdAt: number }>;
  turns: Map<string, { turnId: string; chatId: string; messageIds: string[]; combinedText: string; status: string; createdAt: number }>;
  responseCommits: Map<string, ResponseCommitRecord>;
  conversationLocks: Map<string, { chatId: string; turnId: string; ownerId: string; acquiredAt: number; expiresAt: number }>;
  messageOutbox: Map<string, OutboxDbRecord>;
};

const memory: Memory = {
  customers: [],
  conversations: [],
  messages: [],
  faqs: defaultFaqs(),
  rules: defaultAutomationRules(),
  settings: defaultBotSettings(),
  processed: new Set(),
  logs: [],
  authFiles: {},
  knowledge: [],
  dedup: new Map(),
  turns: new Map(),
  responseCommits: new Map(),
  conversationLocks: new Map(),
  messageOutbox: new Map(),
};

function now() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function supabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export function getSupabaseClient(): SupabaseClient | null {
  return supabase();
}

export function usingSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(url && key);
}

export async function wasProcessed(whatsappMessageId: string) {
  const db = supabase();
  if (db) {
    const { data } = await db
      .from("messages")
      .select("id")
      .eq("whatsapp_message_id", whatsappMessageId)
      .maybeSingle();
    return Boolean(data);
  }
  return memory.processed.has(whatsappMessageId);
}

export async function markProcessed(whatsappMessageId: string) {
  memory.processed.add(whatsappMessageId);
}

export async function upsertCustomer(input: { number: string; name: string }): Promise<Customer> {
  const db = supabase();
  if (db) {
    const { data } = await db
      .from("users")
      .upsert(
        {
          whatsapp_number: input.number,
          name: input.name,
          profile_name: input.name,
          last_seen_at: now(),
        },
        { onConflict: "whatsapp_number" },
      )
      .select()
      .single();
    return data as Customer;
  }
  let row = memory.customers.find((c) => c.whatsapp_number === input.number);
  if (!row) {
    row = {
      id: id("usr"),
      whatsapp_number: input.number,
      name: input.name,
      profile_name: input.name,
      language: "hinglish",
      status: "active",
      metadata: {},
      last_seen_at: now(),
    };
    memory.customers.unshift(row);
  } else {
    row.name = input.name;
    row.last_seen_at = now();
  }
  return row;
}

export async function upsertConversation(userId: string, chatId: string): Promise<Conversation> {
  const db = supabase();
  if (db) {
    const existing = await db.from("conversations").select("*").eq("chat_id", chatId).maybeSingle();
    if (existing.data) return existing.data as Conversation;
    const { data } = await db
      .from("conversations")
      .insert({ user_id: userId, chat_id: chatId, status: "bot", ai_enabled: true, last_message_at: now() })
      .select()
      .single();
    return data as Conversation;
  }
  let row = memory.conversations.find((c) => c.chat_id === chatId);
  if (!row) {
    row = {
      id: id("con"),
      user_id: userId,
      chat_id: chatId,
      status: "bot",
      assigned_agent_id: null,
      current_intent: null,
      ai_enabled: true,
      last_message_at: now(),
    };
    memory.conversations.unshift(row);
  }
  row.last_message_at = now();
  return row;
}

export async function setConversationStatus(idOrChat: string, status: Conversation["status"]) {
  const db = supabase();
  if (db) {
    await db.from("conversations").update({ status }).or(`id.eq.${idOrChat},chat_id.eq.${idOrChat}`);
    return;
  }
  const row = memory.conversations.find((c) => c.id === idOrChat || c.chat_id === idOrChat);
  if (row) row.status = status;
}

export async function addMessage(row: Omit<StoredMessage, "id" | "created_at">): Promise<StoredMessage> {
  const db = supabase();
  const stored: StoredMessage = { ...row, id: id("msg"), created_at: now() };
  if (db) {
    const { data } = await db.from("messages").insert(row).select().single();
    return (data as StoredMessage) ?? stored;
  }
  memory.messages.unshift(stored);
  if (row.direction === "out") memory.processed.add(row.whatsapp_message_id);
  return stored;
}

export async function recentMessages(conversationId: string, limit = 8) {
  const db = supabase();
  if (db) {
    const { data } = await db
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data ?? []) as StoredMessage[];
  }
  return memory.messages.filter((m) => m.conversation_id === conversationId).slice(0, limit);
}

function mapSettings(row: Record<string, unknown>): BotSettings {
  const base = defaultBotSettings();
  const hours = (row.business_hours ?? row.businessHours ?? base.businessHours) as BotSettings["businessHours"];
  return {
    ...base,
    enabled: Boolean(row.enabled ?? base.enabled),
    aiEnabled: Boolean(row.ai_enabled ?? row.aiEnabled ?? base.aiEnabled),
    faqEnabled: Boolean(row.faq_enabled ?? row.faqEnabled ?? base.faqEnabled),
    welcomeEnabled: Boolean(row.welcome_enabled ?? row.welcomeEnabled ?? base.welcomeEnabled),
    defaultLanguage: (row.default_language as BotSettings["defaultLanguage"]) ?? base.defaultLanguage,
    welcomeMessage: String(row.welcome_message ?? row.welcomeMessage ?? base.welcomeMessage),
    fallbackMessage: String(row.fallback_message ?? row.fallbackMessage ?? base.fallbackMessage),
    humanHandoffMessage: String(row.human_handoff_message ?? row.humanHandoffMessage ?? base.humanHandoffMessage),
    timezone: String(row.timezone ?? base.timezone),
    businessHours: hours,
  };
}

function mapRule(row: Record<string, unknown>): AutomationRule {
  return {
    id: String(row.id),
    name: String(row.name),
    triggerType: (row.trigger_type ?? row.triggerType ?? "keyword") as AutomationRule["triggerType"],
    triggerValue: String(row.trigger_value ?? row.triggerValue ?? ""),
    response: String(row.response ?? ""),
    priority: Number(row.priority ?? 100),
    enabled: Boolean(row.enabled ?? true),
  };
}

function mapFaq(row: Record<string, unknown>): Faq {
  return {
    id: String(row.id),
    question: String(row.question),
    answer: String(row.answer),
    keywords: Array.isArray(row.keywords) ? (row.keywords as string[]) : [],
    category: String(row.category ?? "general"),
    priority: Number(row.priority ?? 100),
    enabled: Boolean(row.enabled ?? true),
  };
}

export async function getSettings(): Promise<BotSettings> {
  const db = supabase();
  if (db) {
    const { data } = await db.from("bot_settings").select("*").limit(1).maybeSingle();
    if (data) return mapSettings(data as Record<string, unknown>);
  }
  return memory.settings;
}

export async function saveSettings(settings: BotSettings) {
  memory.settings = settings;
  const db = supabase();
  if (db) {
    await db.from("bot_settings").upsert({
      id: 1,
      enabled: settings.enabled,
      ai_enabled: settings.aiEnabled,
      faq_enabled: settings.faqEnabled,
      welcome_enabled: settings.welcomeEnabled,
      default_language: settings.defaultLanguage,
      welcome_message: settings.welcomeMessage,
      fallback_message: settings.fallbackMessage,
      human_handoff_message: settings.humanHandoffMessage,
      timezone: settings.timezone,
      business_hours: settings.businessHours,
    });
  }
}

export async function getRules() {
  const db = supabase();
  if (db) {
    const { data } = await db.from("automation_rules").select("*").order("priority");
    if (data?.length) return data.map((row) => mapRule(row as Record<string, unknown>));
  }
  return memory.rules;
}

export async function saveRules(rules: AutomationRule[]) {
  memory.rules = rules;
  const db = supabase();
  if (!db) return;
  await db.from("automation_rules").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (rules.length) {
    await db.from("automation_rules").insert(
      rules.map((r) => ({
        id: r.id.match(/^[0-9a-f-]{36}$/i) ? r.id : undefined,
        name: r.name,
        trigger_type: r.triggerType,
        trigger_value: r.triggerValue,
        response: r.response,
        priority: r.priority,
        enabled: r.enabled,
      })),
    );
  }
}

export async function getFaqs() {
  const db = supabase();
  if (db) {
    const { data } = await db.from("faqs").select("*").order("priority");
    if (data?.length) return data.map((row) => mapFaq(row as Record<string, unknown>));
  }
  return memory.faqs;
}

export async function saveFaqs(faqs: Faq[]) {
  memory.faqs = faqs;
  const db = supabase();
  if (!db) return;
  await db.from("faqs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (faqs.length) {
    await db.from("faqs").insert(
      faqs.map((f) => ({
        id: f.id.match(/^[0-9a-f-]{36}$/i) ? f.id : undefined,
        question: f.question,
        answer: f.answer,
        keywords: f.keywords,
        category: f.category,
        priority: f.priority,
        enabled: f.enabled,
      })),
    );
  }
}

export async function listCustomers() {
  const db = supabase();
  if (db) {
    const { data } = await db.from("users").select("*").order("last_seen_at", { ascending: false }).limit(200);
    return (data ?? []) as Customer[];
  }
  return memory.customers;
}

export async function listConversations() {
  const db = supabase();
  if (db) {
    const { data } = await db.from("conversations").select("*").order("last_message_at", { ascending: false }).limit(200);
    return (data ?? []) as Conversation[];
  }
  return memory.conversations;
}

export async function listMessages() {
  const db = supabase();
  if (db) {
    const { data } = await db.from("messages").select("*").order("created_at", { ascending: false }).limit(80);
    return (data ?? []) as StoredMessage[];
  }
  return memory.messages.slice(0, 80);
}

export async function addLog(level: LogEvent["level"], source: string, message: string) {
  const event = { id: id("log"), level, source, message, created_at: now() };
  memory.logs.unshift(event);
  const db = supabase();
  if (db) await db.from("app_logs").insert({ level, source, message });
}

export async function listLogs() {
  const db = supabase();
  if (db) {
    const { data } = await db.from("app_logs").select("*").order("created_at", { ascending: false }).limit(100);
    return (data ?? []) as LogEvent[];
  }
  return memory.logs.slice(0, 100);
}

export async function knowledgeSearch(query: string) {
  const q = query.toLowerCase();
  const db = supabase();
  if (db) {
    const { data } = await db.from("knowledge_documents").select("title, content").eq("enabled", true).limit(20);
    return (data ?? [])
      .filter((k) => k.title.toLowerCase().includes(q) || k.content.toLowerCase().includes(q))
      .map((k) => k.content as string)
      .slice(0, 3);
  }
  return memory.knowledge
    .filter((k) => k.enabled && (k.title.toLowerCase().includes(q) || k.content.toLowerCase().includes(q)))
    .map((k) => k.content)
    .slice(0, 3);
}

export async function listKnowledge() {
  const db = supabase();
  if (db) {
    const { data } = await db.from("knowledge_documents").select("id, title, content, enabled").order("updated_at", { ascending: false });
    return (data ?? []) as Array<{ id: string; title: string; content: string; enabled: boolean }>;
  }
  return memory.knowledge;
}

export async function upsertKnowledge(doc: { title: string; content: string; enabled?: boolean }) {
  const row = { id: id("kb"), title: doc.title, content: doc.content, enabled: doc.enabled !== false };
  memory.knowledge.unshift(row);
  const db = supabase();
  if (db) {
    const { data } = await db
      .from("knowledge_documents")
      .insert({ title: doc.title, content: doc.content, enabled: row.enabled })
      .select("id, title, content, enabled")
      .single();
    return (data as typeof row) ?? row;
  }
  return row;
}

export async function saveAuthFiles(files: Record<string, string>) {
  memory.authFiles = files;
  const db = supabase();
  if (!db) return;
  const rows = Object.entries(files).map(([filename, data]) => ({ filename, data }));
  if (!rows.length) return;
  // Upsert in batches of 50 to avoid request size limits
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const { error } = await db.from("baileys_auth").upsert(batch, { onConflict: "filename" });
    if (error) {
      console.error("[database] auth batch upsert failed:", error.message);
    }
  }
}

export async function loadAuthFiles(): Promise<Record<string, string>> {
  const db = supabase();
  if (db) {
    const { data, error } = await db.from("baileys_auth").select("filename, data").limit(2000);
    if (!error && data?.length) {
      const files: Record<string, string> = {};
      for (const row of data) files[row.filename] = row.data;
      if (Object.keys(files).length) return files;
    }
  }
  return { ...memory.authFiles };
}

export async function clearAuthFiles() {
  memory.authFiles = {};
  const db = supabase();
  if (db) await db.from("baileys_auth").delete().neq("filename", "");
}

export function analyticsSnapshot() {
  const inbound = memory.messages.filter((m) => m.direction === "in").length;
  const outbound = memory.messages.filter((m) => m.direction === "out").length;
  const ai = memory.messages.filter((m) => m.ai_generated).length;
  const handoffs = memory.conversations.filter((c) => c.status !== "bot").length;
  return {
    customers: memory.customers.length,
    conversations: memory.conversations.length,
    messagesIn: inbound,
    messagesOut: outbound,
    aiReplies: ai,
    handoffs,
    errors: memory.logs.filter((l) => l.level === "error").length,
  };
}

export type WorkerHeartbeat = {
  phase: string;
  connected: boolean;
  phone: string | null;
  pairingCode: string | null;
  qrDataUrl: string | null;
  tunnelUrl?: string | null;
  error: string | null;
  updatedAt: string;
};

export async function saveWorkerHeartbeat(heartbeat: WorkerHeartbeat) {
  const jsonStr = JSON.stringify(heartbeat);
  memory.authFiles["__worker_heartbeat.json"] = jsonStr;
  const db = supabase();
  if (!db) return;
  try {
    await db.from("baileys_auth").upsert(
      { filename: "__worker_heartbeat.json", data: jsonStr },
      { onConflict: "filename" },
    );
  } catch (err) {
    console.error("[database] saveWorkerHeartbeat error:", err);
  }
}

export async function loadWorkerHeartbeat(): Promise<WorkerHeartbeat | null> {
  const db = supabase();
  if (db) {
    try {
      const { data, error } = await db
        .from("baileys_auth")
        .select("data")
        .eq("filename", "__worker_heartbeat.json")
        .maybeSingle();
      if (!error && data?.data) {
        return JSON.parse(data.data) as WorkerHeartbeat;
      }
    } catch {
      /* fallback */
    }
  }
  if (memory.authFiles["__worker_heartbeat.json"]) {
    try {
      return JSON.parse(memory.authFiles["__worker_heartbeat.json"]) as WorkerHeartbeat;
    } catch {
      return null;
    }
  }
  return null;
}

export type WorkerLease = {
  id: string;
  instanceId: string;
  acquiredAt: string;
  renewedAt: string;
  expiresAt: string;
};

export async function acquireWorkerLease(instanceId: string, ttlMs: number = 30_000): Promise<boolean> {
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  const nowIso = new Date().toISOString();
  const db = supabase();
  if (db) {
    try {
      const { data, error } = await db
        .from("worker_leases")
        .select("*")
        .eq("id", "primary_worker")
        .maybeSingle();

      if (!error && data) {
        const isExpired = new Date(data.expires_at).getTime() < Date.now();
        if (data.instance_id !== instanceId && !isExpired) {
          return false;
        }
      }

      const { error: upsertErr } = await db.from("worker_leases").upsert({
        id: "primary_worker",
        instance_id: instanceId,
        renewed_at: nowIso,
        expires_at: expiresAt,
      });
      if (!upsertErr) return true;
    } catch {
      /* fallback to baileys_auth lock */
    }
  }

  const lockKey = "__worker_primary_lease.json";
  try {
    const raw = memory.authFiles[lockKey];
    if (raw) {
      const lease = JSON.parse(raw) as WorkerLease;
      if (lease.instanceId !== instanceId && new Date(lease.expiresAt).getTime() > Date.now()) {
        return false;
      }
    }
    const newLease: WorkerLease = {
      id: "primary_worker",
      instanceId,
      acquiredAt: nowIso,
      renewedAt: nowIso,
      expiresAt,
    };
    const jsonStr = JSON.stringify(newLease);
    memory.authFiles[lockKey] = jsonStr;
    if (db) {
      await db.from("baileys_auth").upsert(
        { filename: lockKey, data: jsonStr },
        { onConflict: "filename" },
      );
    }
    return true;
  } catch {
    return true;
  }
}

export async function releaseWorkerLease(instanceId: string): Promise<void> {
  const db = supabase();
  if (db) {
    try {
      await db.from("worker_leases").delete().eq("id", "primary_worker").eq("instance_id", instanceId);
    } catch {
      /* fallback */
    }
  }
  const lockKey = "__worker_primary_lease.json";
  try {
    const raw = memory.authFiles[lockKey];
    if (raw) {
      const lease = JSON.parse(raw) as WorkerLease;
      if (lease.instanceId === instanceId) {
        delete memory.authFiles[lockKey];
        if (db) await db.from("baileys_auth").delete().eq("filename", lockKey);
      }
    }
  } catch {
    /* ignore */
  }
}

// ============================================================
// Authoritative Conversation Engine Persistence Functions
// ============================================================

export interface MessageDedupRecord {
  messageId: string;
  eventId: string;
  chatId: string;
  senderId: string;
  contentHash: string;
  normalizedHash: string;
  createdAt?: number;
}

export async function recordMessageDedup(entry: MessageDedupRecord): Promise<boolean> {
  const db = supabase();
  const nowMs = Date.now();
  // Check in-memory first
  if (memory.dedup.has(entry.messageId) || memory.dedup.has(entry.eventId)) {
    return false;
  }
  memory.dedup.set(entry.messageId, { ...entry, createdAt: nowMs });
  memory.dedup.set(entry.eventId, { ...entry, createdAt: nowMs });

  if (db) {
    try {
      const { error } = await db.from("message_dedup").insert({
        message_id: entry.messageId,
        event_id: entry.eventId,
        chat_id: entry.chatId,
        sender_id: entry.senderId,
        content_hash: entry.contentHash,
        normalized_hash: entry.normalizedHash,
      });
      if (error && (error.code === "23505" || /duplicate key/i.test(error.message))) {
        return false;
      }
    } catch {
      /* fallback */
    }
  }
  return true;
}

export async function isMessageDeduped(params: {
  messageId?: string;
  eventId?: string;
  contentHash?: string;
  chatId?: string;
  senderId?: string;
  windowMs?: number;
}): Promise<boolean> {
  if (params.messageId && memory.dedup.has(params.messageId)) return true;
  if (params.eventId && memory.dedup.has(params.eventId)) return true;

  const db = supabase();
  if (db) {
    try {
      if (params.messageId) {
        const { data } = await db.from("message_dedup").select("id").eq("message_id", params.messageId).maybeSingle();
        if (data) return true;
      }
      if (params.eventId) {
        const { data } = await db.from("message_dedup").select("id").eq("event_id", params.eventId).maybeSingle();
        if (data) return true;
      }
      if (params.contentHash && params.chatId && params.senderId) {
        const windowStart = new Date(Date.now() - (params.windowMs ?? 15_000)).toISOString();
        const { data } = await db
          .from("message_dedup")
          .select("id")
          .eq("content_hash", params.contentHash)
          .eq("chat_id", params.chatId)
          .eq("sender_id", params.senderId)
          .gte("created_at", windowStart)
          .maybeSingle();
        if (data) return true;
      }
    } catch {
      /* ignore db error, rely on memory */
    }
  }
  return false;
}

export interface ConversationTurnRecord {
  turnId: string;
  chatId: string;
  messageIds: string[];
  combinedText: string;
  status?: string;
  createdAt?: number;
}

export async function upsertConversationTurn(entry: ConversationTurnRecord): Promise<void> {
  const nowMs = Date.now();
  memory.turns.set(entry.turnId, {
    turnId: entry.turnId,
    chatId: entry.chatId,
    messageIds: entry.messageIds,
    combinedText: entry.combinedText,
    status: entry.status ?? "created",
    createdAt: nowMs,
  });

  const db = supabase();
  if (db) {
    try {
      await db.from("conversation_turns").upsert(
        {
          turn_id: entry.turnId,
          chat_id: entry.chatId,
          message_ids: entry.messageIds,
          combined_text: entry.combinedText,
          status: entry.status ?? "created",
        },
        { onConflict: "turn_id" }
      );
    } catch {
      /* fallback */
    }
  }
}

export async function getConversationTurn(turnId: string): Promise<ConversationTurnRecord | null> {
  const mem = memory.turns.get(turnId);
  if (mem) return mem;

  const db = supabase();
  if (db) {
    try {
      const { data } = await db.from("conversation_turns").select("*").eq("turn_id", turnId).maybeSingle();
      if (data) {
        return {
          turnId: data.turn_id,
          chatId: data.chat_id,
          messageIds: data.message_ids ?? [],
          combinedText: data.combined_text,
          status: data.status,
          createdAt: new Date(data.created_at).getTime(),
        };
      }
    } catch {
      /* fallback */
    }
  }
  return null;
}

export interface ResponseCommitRecord {
  responseId: string;
  turnId: string;
  chatId: string;
  status: "CREATED" | "RESERVED" | "COMMITTED" | "SENDING" | "SENT" | "RETRY_PENDING" | "DEAD_LETTER";
  finalText: string;
  intent?: string;
  modelId?: string;
  plan?: Record<string, unknown>;
  createdAt?: number;
  committedAt?: number;
  sentAt?: number;
  attemptCount?: number;
  lastError?: string;
}

export async function recordResponseCommit(
  entry: ResponseCommitRecord
): Promise<{ committed: boolean; existing?: ResponseCommitRecord }> {
  const nowMs = Date.now();
  // Check if turn already committed
  const existingTurn = Array.from(memory.responseCommits.values()).find((r) => r.turnId === entry.turnId);
  if (existingTurn) {
    return { committed: false, existing: existingTurn };
  }
  const existingId = memory.responseCommits.get(entry.responseId);
  if (existingId) {
    return { committed: false, existing: existingId };
  }

  const db = supabase();
  if (db) {
    try {
      const { data, error } = await db.from("response_commits").insert({
        response_id: entry.responseId,
        turn_id: entry.turnId,
        chat_id: entry.chatId,
        status: entry.status,
        final_text: entry.finalText,
        intent: entry.intent,
        model_id: entry.modelId,
        plan: entry.plan ?? {},
        attempt_count: entry.attemptCount ?? 0,
      }).select().maybeSingle();

      if (error && (error.code === "23505" || /duplicate key/i.test(error.message))) {
        // Fetch existing
        const { data: existing } = await db.from("response_commits").select("*").eq("turn_id", entry.turnId).maybeSingle();
        if (existing) {
          const rec: ResponseCommitRecord = {
            responseId: existing.response_id,
            turnId: existing.turn_id,
            chatId: existing.chat_id,
            status: existing.status,
            finalText: existing.final_text,
            intent: existing.intent,
            modelId: existing.model_id,
            plan: existing.plan,
            createdAt: new Date(existing.created_at).getTime(),
            committedAt: new Date(existing.committed_at).getTime(),
            sentAt: existing.sent_at ? new Date(existing.sent_at).getTime() : undefined,
            attemptCount: existing.attempt_count,
            lastError: existing.last_error,
          };
          memory.responseCommits.set(rec.responseId, rec);
          return { committed: false, existing: rec };
        }
      }
    } catch {
      /* fallback to memory */
    }
  }

  const rec: ResponseCommitRecord = {
    ...entry,
    createdAt: nowMs,
    committedAt: nowMs,
    attemptCount: entry.attemptCount ?? 0,
  };
  memory.responseCommits.set(entry.responseId, rec);
  return { committed: true, existing: rec };
}

export async function updateResponseCommitStatus(
  responseId: string,
  status: ResponseCommitRecord["status"],
  error?: string
): Promise<void> {
  const existing = memory.responseCommits.get(responseId);
  if (existing) {
    existing.status = status;
    if (status === "SENT") existing.sentAt = Date.now();
    if (error) existing.lastError = error;
  }

  const db = supabase();
  if (db) {
    try {
      const updates: Record<string, unknown> = { status };
      if (status === "SENT") updates.sent_at = now();
      if (error) updates.last_error = error;
      await db.from("response_commits").update(updates).eq("response_id", responseId);
    } catch {
      /* fallback */
    }
  }
}

export async function getResponseCommitByTurn(turnId: string): Promise<ResponseCommitRecord | null> {
  const mem = Array.from(memory.responseCommits.values()).find((r) => r.turnId === turnId);
  if (mem) return mem;

  const db = supabase();
  if (db) {
    try {
      const { data } = await db.from("response_commits").select("*").eq("turn_id", turnId).maybeSingle();
      if (data) {
        return {
          responseId: data.response_id,
          turnId: data.turn_id,
          chatId: data.chat_id,
          status: data.status,
          finalText: data.final_text,
          intent: data.intent,
          modelId: data.model_id,
          plan: data.plan,
          createdAt: new Date(data.created_at).getTime(),
          committedAt: new Date(data.committed_at).getTime(),
          sentAt: data.sent_at ? new Date(data.sent_at).getTime() : undefined,
          attemptCount: data.attempt_count,
          lastError: data.last_error,
        };
      }
    } catch {
      /* fallback */
    }
  }
  return null;
}

// --- Single-Flight Conversation Locking ---
export async function acquireChatLockDb(
  chatId: string,
  turnId: string,
  ownerId: string,
  ttlMs = 25_000
): Promise<boolean> {
  const nowMs = Date.now();
  const expiresAtMs = nowMs + ttlMs;

  const mem = memory.conversationLocks.get(chatId);
  if (mem && mem.expiresAt > nowMs && mem.ownerId !== ownerId) {
    return false;
  }
  memory.conversationLocks.set(chatId, {
    chatId,
    turnId,
    ownerId,
    acquiredAt: nowMs,
    expiresAt: expiresAtMs,
  });

  const db = supabase();
  if (db) {
    try {
      const expiresAtIso = new Date(expiresAtMs).toISOString();
      // Try to acquire lock row
      const { data, error } = await db
        .from("conversation_locks")
        .upsert(
          {
            chat_id: chatId,
            turn_id: turnId,
            owner_id: ownerId,
            acquired_at: now(),
            expires_at: expiresAtIso,
          },
          { onConflict: "chat_id" }
        )
        .select();
      if (error) return true; // fallback to memory
    } catch {
      /* fallback */
    }
  }
  return true;
}

export async function releaseChatLockDb(chatId: string, turnId: string, ownerId: string): Promise<void> {
  const mem = memory.conversationLocks.get(chatId);
  if (mem && (mem.ownerId === ownerId || mem.turnId === turnId)) {
    memory.conversationLocks.delete(chatId);
  }

  const db = supabase();
  if (db) {
    try {
      await db.from("conversation_locks").delete().eq("chat_id", chatId).eq("owner_id", ownerId);
    } catch {
      /* fallback */
    }
  }
}

// --- Authoritative Outbox Queue Persistence ---
export interface OutboxDbRecord {
  responseId: string;
  turnId?: string;
  chatId: string;
  text: string;
  status: "pending" | "sending" | "sent" | "failed" | "dead_letter";
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  sentAt?: number;
  lastError?: string;
}

export async function enqueueMessageOutboxDb(entry: {
  responseId: string;
  turnId?: string;
  chatId: string;
  text: string;
  maxAttempts?: number;
}): Promise<OutboxDbRecord> {
  const nowMs = Date.now();
  const existing = memory.messageOutbox.get(entry.responseId);
  if (existing) return existing;

  const rec: OutboxDbRecord = {
    responseId: entry.responseId,
    turnId: entry.turnId,
    chatId: entry.chatId,
    text: entry.text,
    status: "pending",
    attempts: 0,
    maxAttempts: entry.maxAttempts ?? 2,
    createdAt: nowMs,
  };
  memory.messageOutbox.set(entry.responseId, rec);

  const db = supabase();
  if (db) {
    try {
      await db.from("message_outbox").upsert(
        {
          response_id: entry.responseId,
          turn_id: entry.turnId,
          chat_id: entry.chatId,
          text: entry.text,
          status: "pending",
          attempts: 0,
          max_attempts: entry.maxAttempts ?? 2,
        },
        { onConflict: "response_id" }
      );
    } catch {
      /* fallback */
    }
  }
  return rec;
}

export async function updateOutboxStatusDb(
  responseId: string,
  status: OutboxDbRecord["status"],
  error?: string
): Promise<void> {
  const existing = memory.messageOutbox.get(responseId);
  if (existing) {
    existing.status = status;
    if (status === "sending") existing.attempts += 1;
    if (status === "sent") existing.sentAt = Date.now();
    if (error) existing.lastError = error;
  }

  const db = supabase();
  if (db) {
    try {
      const updates: Record<string, unknown> = { status };
      if (status === "sent") updates.sent_at = now();
      if (error) updates.last_error = error;
      await db.from("message_outbox").update(updates).eq("response_id", responseId);
    } catch {
      /* fallback */
    }
  }
}

export async function getPendingOutboxItemsDb(): Promise<OutboxDbRecord[]> {
  const db = supabase();
  if (db) {
    try {
      const { data } = await db
        .from("message_outbox")
        .select("*")
        .in("status", ["pending", "failed", "sending"])
        .order("created_at", { ascending: true });
      if (data && data.length > 0) {
        return data.map((d) => ({
          responseId: d.response_id,
          turnId: d.turn_id,
          chatId: d.chat_id,
          text: d.text,
          status: d.status,
          attempts: d.attempts ?? 0,
          maxAttempts: d.max_attempts ?? 2,
          createdAt: new Date(d.created_at).getTime(),
          sentAt: d.sent_at ? new Date(d.sent_at).getTime() : undefined,
          lastError: d.last_error,
        }));
      }
    } catch {
      /* fallback */
    }
  }
  return Array.from(memory.messageOutbox.values()).filter(
    (item) => item.status === "pending" || item.status === "failed" || item.status === "sending"
  );
}
