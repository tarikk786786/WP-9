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
  status: "bot" | "waiting_human" | "human" | "closed";
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
};

function now() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function supabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export function usingSupabase() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
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
