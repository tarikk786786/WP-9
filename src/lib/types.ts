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
  createdAt: string;
};

export type ScanPhase = "idle" | "qr" | "connecting" | "ready" | "logged_out";

export type ScanSnapshot = {
  phase: ScanPhase;
  qrDataUrl: string | null;
  phone: string | null;
  error: string | null;
};

export type ConnectionStatus = {
  configured: boolean;
  hasAccessToken: boolean;
  hasPhoneNumberId: boolean;
  hasVerifyToken: boolean;
  hasAppSecret: boolean;
  graphApiVersion: string;
};
