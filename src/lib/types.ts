export type KeywordRule = {
  id: string;
  keyword: string;
  reply: string;
  enabled: boolean;
};

export type BotRules = {
  enabled: boolean;
  botName: string;
  defaultReply: string;
  greetingReply: string;
  includeName: boolean;
  useLocalLlm: boolean;
  preferredModel: string;
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
};

export type LlmEndpoint = {
  id: string;
  name: string;
  kind: "ollama" | "openai-compatible" | "transformers";
  baseUrl?: string;
  online: boolean;
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
