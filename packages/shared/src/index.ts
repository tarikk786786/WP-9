import { z } from "zod";

export const ConversationStatus = z.enum(["bot", "waiting_human", "human", "closed"]);
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
    phase: z.enum(["idle", "qr", "connecting", "ready", "logged_out"]),
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
  defaultLanguage: "hinglish",
  welcomeMessage: "haan, kya haal hai",
  fallbackMessage: "dekh liya. bolo",
  humanHandoffMessage: "theek, thoda wait, dekh ke likhta hoon",
  timezone: "Asia/Kolkata",
  businessHours: {
    enabled: false,
    days: [1, 2, 3, 4, 5],
    open: "09:00",
    close: "18:00",
    afterHoursMessage: "thoda late ho gaya mere side. subah dekh ke likhta hoon",
  },
  replyToGroups: false,
  replyToMedia: true,
});

export const defaultAutomationRules = (): AutomationRule[] => [
  { id: "hi", name: "Greeting hi", triggerType: "keyword", triggerValue: "hi", response: "haan, kya haal hai", priority: 10, enabled: true },
  { id: "hello", name: "Greeting hello", triggerType: "keyword", triggerValue: "hello", response: "haan, bolo", priority: 10, enabled: true },
  { id: "price", name: "Pricing", triggerType: "keyword", triggerValue: "price", response: "rate andaz se nahi bolta", priority: 20, enabled: true },
  { id: "hours", name: "Hours", triggerType: "keyword", triggerValue: "hours", response: "ist. aksar din mein yahin, avg 24 ghante ke andar", priority: 20, enabled: true },
  { id: "human", name: "Human", triggerType: "keyword", triggerValue: "talk to a human", response: "theek, thoda wait, dekh ke likhta hoon", priority: 5, enabled: true },
];

export const defaultFaqs = (): Faq[] => [
  {
    id: "who",
    question: "Who are you?",
    answer: "tarik hoon. bolo",
    keywords: ["who are you", "kaun ho", "your name"],
    category: "identity",
    priority: 1,
    enabled: true,
  },
  {
    id: "site",
    question: "Website?",
    answer: "tarikislam.in pe dekh lena. studio dezo.in pe hai",
    keywords: ["website", "portfolio", "site"],
    category: "identity",
    priority: 2,
    enabled: true,
  },
  {
    id: "where",
    question: "Where are you based?",
    answer: "bhubaneswar, india se kaam karta hoon",
    keywords: ["where are you", "kidhar ho", "kahan se kaam"],
    category: "identity",
    priority: 3,
    enabled: true,
  },
  {
    id: "contact",
    question: "How do I contact you?",
    answer: "email princetarikislam@gmail.com. number +91 89844 73230",
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
