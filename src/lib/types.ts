export type KeywordRule = {
  id: string;
  keyword: string;
  reply: string;
  enabled: boolean;
};

export type VoiceLanguage = "hinglish" | "english" | "hindi";
export type VoiceTone = "soft" | "warm" | "sharp";
export type ReplyMode = "all" | "keywords" | "greetings";

export type BotRules = {
  enabled: boolean;
  botName: string;
  defaultReply: string;
  greetingReply: string;
  includeName: boolean;
  useLocalLlm: boolean;
  preferredModel: string;
  language: VoiceLanguage;
  tone: VoiceTone;
  emoji: boolean;
  signature: string;
  customFacts: string;
  replyMode: ReplyMode;
  replyToMedia: boolean;
  replyToGroups: boolean;
  showTyping: boolean;
  businessHoursEnabled: boolean;
  timezone: string;
  openHour: number;
  closeHour: number;
  afterHoursReply: string;
  keywordRules: KeywordRule[];
};

export type InboxMessage = {
  id: string;
  from: string;
  fromName: string;
  body: string;
  reply: string | null;
  skippedReason: string | null;
  source: "whatsapp" | "simulator" | "scan";
  engine?: string;
  createdAt: string;
};

export type ScanPhase = "idle" | "qr" | "connecting" | "ready" | "logged_out";

export type ScanSnapshot = {
  phase: ScanPhase;
  qrDataUrl: string | null;
  phone: string | null;
  error: string | null;
  persisted: boolean;
  savedAt: string | null;
};

export type LlmEndpoint = {
  id: string;
  name: string;
  kind: "ollama" | "openai-compatible" | "transformers" | "hinglish";
  baseUrl?: string;
  online: boolean;
  live: boolean;
  models: string[];
};

export type LiveStatus = {
  alive: boolean;
  startedAt: string;
  whatsapp: ScanSnapshot;
  llms: LlmEndpoint[];
};

export type ConnectionStatus = {
  configured: boolean;
  hasAccessToken: boolean;
  hasPhoneNumberId: boolean;
  hasVerifyToken: boolean;
  hasAppSecret: boolean;
  graphApiVersion: string;
};
