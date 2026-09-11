import { z } from "zod";

export const ConversationStatus = z.enum(["bot", "waiting_human", "human", "paused", "closed"]);
export type ConversationStatus = z.infer<typeof ConversationStatus>;

export const MessageType = z.enum([
  "text",
  "image",
  "audio",
  "video",
  "document",
  "sticker",
  "location",
  "contact",
  "reaction",
  "buttons",
  "list",
  "quoted",
  "unknown",
]);
export type MessageType = z.infer<typeof MessageType>;

export const NormalizedMessage = z.object({
  id: z.string(),
  whatsappMessageId: z.string(),
  sender: z.string(),
  chatId: z.string(),
  fromName: z.string(),
  type: MessageType,
  text: z.string(),
  timestamp: z.string(),
  isGroup: z.boolean(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type NormalizedMessage = z.infer<typeof NormalizedMessage>;

export const SendMessageBody = z.object({
  chatId: z.string().min(1),
  message: z.string().min(1).max(2000),
});
export type SendMessageBody = z.infer<typeof SendMessageBody>;

export const WorkerHealth = z.object({
  worker: z.literal("ok"),
  uptimeMs: z.number(),
  whatsapp: z.object({
    phase: z.string(),
    connected: z.boolean(),
    phone: z.string().nullable(),
    qrDataUrl: z.string().nullable(),
    pairingCode: z.string().nullable(),
    persisted: z.boolean(),
    error: z.string().nullable(),
    lastConnectedAt: z.string().nullable(),
    lastMessageReceivedAt: z.string().nullable(),
    lastMessageSentAt: z.string().nullable(),
  }),
  stateMachine: z.record(z.string(), z.unknown()).optional(),
  circuitBreakers: z.record(z.string(), z.unknown()).optional(),
  outbox: z.record(z.string(), z.unknown()).optional(),
});
export type WorkerHealth = z.infer<typeof WorkerHealth>;

export const AutomationRule = z.object({
  id: z.string(),
  name: z.string(),
  triggerType: z.enum(["exact", "contains", "keyword", "regex"]),
  triggerValue: z.string(),
  response: z.string(),
  priority: z.number(),
  enabled: z.boolean(),
});
export type AutomationRule = z.infer<typeof AutomationRule>;

export const Faq = z.object({
  id: z.string(),
  question: z.string(),
  answer: z.string(),
  keywords: z.array(z.string()),
  category: z.string(),
  priority: z.number(),
  enabled: z.boolean(),
});
export type Faq = z.infer<typeof Faq>;

export const BotSettings = z.object({
  enabled: z.boolean(),
  aiEnabled: z.boolean(),
  faqEnabled: z.boolean(),
  welcomeEnabled: z.boolean(),
  defaultLanguage: z.enum(["hinglish", "english", "hindi"]),
  welcomeMessage: z.string(),
  fallbackMessage: z.string(),
  humanHandoffMessage: z.string(),
  timezone: z.string(),
  businessHours: z.object({
    enabled: z.boolean(),
    days: z.array(z.number()),
    open: z.string(),
    close: z.string(),
    afterHoursMessage: z.string(),
  }),
  replyToGroups: z.boolean(),
  replyToMedia: z.boolean(),
});
export type BotSettings = z.infer<typeof BotSettings>;

export const defaultBotSettings = (): BotSettings => ({
  enabled: true,
  aiEnabled: true,
  faqEnabled: true,
  welcomeEnabled: true,
  defaultLanguage: "english",
  welcomeMessage: "Hello! How can I help you today?",
  fallbackMessage: "Received your message. How can I help you?",
  humanHandoffMessage: "Sure, transferring you to a human agent. Please hold on.",
  timezone: "Asia/Kolkata",
  businessHours: {
    enabled: false,
    days: [1, 2, 3, 4, 5],
    open: "09:00",
    close: "18:00",
    afterHoursMessage: "Thanks for reaching out! We are currently outside of business hours and will get back to you shortly.",
  },
  replyToGroups: false,
  replyToMedia: true,
});

export const defaultAutomationRules = (): AutomationRule[] => [
  { id: "hi", name: "Greeting hi", triggerType: "keyword", triggerValue: "hi", response: "Hello! How can I help you today?", priority: 10, enabled: true },
  { id: "hello", name: "Greeting hello", triggerType: "keyword", triggerValue: "hello", response: "Hello! How can I help you today?", priority: 10, enabled: true },
  { id: "price", name: "Pricing", triggerType: "keyword", triggerValue: "price", response: "Pricing depends on project scope. Share your requirements and I'll send a quote.", priority: 20, enabled: true },
  { id: "hours", name: "Hours", triggerType: "keyword", triggerValue: "hours", response: "Operating in IST hours (typically 9 AM - 6 PM), responding within 24 hours.", priority: 20, enabled: true },
  { id: "human", name: "Human", triggerType: "keyword", triggerValue: "talk to a human", response: "Sure, transferring you to a human agent. Please hold on.", priority: 5, enabled: true },
];

export const defaultFaqs = (): Faq[] => [
  {
    id: "who",
    question: "Who are you?",
    answer: "I'm Tarik Islam. How can I help you today?",
    keywords: ["who are you", "your name", "who is this"],
    category: "identity",
    priority: 1,
    enabled: true,
  },
  {
    id: "site",
    question: "Website?",
    answer: "You can find my portfolio at tarikislam.in and studio at dezo.in.",
    keywords: ["website", "portfolio", "site"],
    category: "identity",
    priority: 2,
    enabled: true,
  },
  {
    id: "where",
    question: "Where are you based?",
    answer: "I work from Bhubaneswar, India.",
    keywords: ["where are you", "location", "based in"],
    category: "identity",
    priority: 3,
    enabled: true,
  },
  {
    id: "contact",
    question: "How do I contact you?",
    answer: "Email: princetarikislam@gmail.com. Phone: +91 89844 73230",
    keywords: ["email", "contact number"],
    category: "identity",
    priority: 4,
    enabled: true,
  },
];

export type RouteSource = "command" | "handoff" | "hours" | "rule" | "faq" | "knowledge" | "ai" | "fallback" | "skip";

export type BotDecision = {
  action: "reply" | "skip" | "handoff";
  text: string;
  source: RouteSource;
  intent?: string;
};

export const WorkerErrorCode = z.enum([
  "WORKER_UNREACHABLE",
  "WORKER_TIMEOUT",
  "WORKER_AUTH_FAILED",
  "WORKER_HTTP_ERROR",
  "WORKER_STARTING",
  "WORKER_NOT_READY",
  "WHATSAPP_DISCONNECTED",
  "WHATSAPP_RECONNECTING",
  "WHATSAPP_QR_REQUIRED",
  "WHATSAPP_LOGGED_OUT",
  "DATABASE_UNAVAILABLE",
  "QUEUE_UNAVAILABLE",
  "SESSION_UNAVAILABLE",
  "CONFIGURATION_ERROR",
]);
export type WorkerErrorCode = z.infer<typeof WorkerErrorCode>;

export const WorkerLiveness = z.object({
  ok: z.literal(true),
  service: z.string(),
  status: z.literal("alive"),
  uptimeSeconds: z.number(),
  timestamp: z.string(),
});
export type WorkerLiveness = z.infer<typeof WorkerLiveness>;

export const WorkerReadiness = z.object({
  ok: z.boolean(),
  ready: z.boolean(),
  worker: z.enum(["ready", "starting", "degraded", "not_ready"]),
  whatsapp: z.enum([
    "connected",
    "connecting",
    "reconnecting",
    "qr_required",
    "initializing",
    "logged_out",
    "error",
  ]),
  database: z.enum(["healthy", "unhealthy", "disconnected"]),
  auth: z.enum(["valid", "awaiting_scan", "expired", "corrupted", "none"]),
  queue: z.enum(["healthy", "degraded", "unavailable"]),
  timestamp: z.string(),
});
export type WorkerReadiness = z.infer<typeof WorkerReadiness>;

export const WorkerDetailedHealth = z.object({
  service: z.string(),
  version: z.string(),
  uptimeSeconds: z.number(),
  pid: z.number(),
  process: z.object({
    status: z.enum(["starting", "running", "stopping", "stopped", "crashed"]),
    memoryUsageMb: z.number(),
  }),
  http: z.object({
    status: z.enum(["healthy", "degraded", "unreachable"]),
    port: z.number(),
    host: z.string(),
  }),
  whatsapp: z.object({
    status: z.string(),
    phone: z.string().nullable(),
    qrDataUrl: z.string().nullable(),
    pairingCode: z.string().nullable(),
    lastConnectedAt: z.string().nullable(),
    lastDisconnectAt: z.string().nullable(),
    reconnectAttempts: z.number(),
  }),
  database: z.object({
    status: z.enum(["healthy", "unhealthy", "disconnected"]),
    latencyMs: z.number().nullable(),
  }),
  auth: z.object({
    status: z.string(),
    source: z.string(),
  }),
  queue: z.object({
    status: z.string(),
    pending: z.number(),
    processing: z.number(),
    failed: z.number(),
    deadLetters: z.number(),
  }),
  heartbeat: z.object({
    lastHeartbeatAt: z.string().nullable(),
  }),
  lease: z.object({
    acquired: z.boolean(),
    instanceId: z.string().nullable(),
    expiresAt: z.string().nullable(),
  }).optional(),
});
export type WorkerDetailedHealth = z.infer<typeof WorkerDetailedHealth>;

