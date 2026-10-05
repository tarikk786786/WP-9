/**
 * WP-9 Voice Calling Core Types and Interfaces
 */

export type CallState =
  | "IDLE"
  | "INCOMING"
  | "RINGING"
  | "ANSWERING"
  | "CONNECTED"
  | "LISTENING"
  | "THINKING"
  | "SPEAKING"
  | "INTERRUPTED"
  | "PAUSED"
  | "ENDING"
  | "ENDED"
  | "FAILED";

export type CallEndReason =
  | "CALLER_HANGUP"
  | "BOT_HANGUP"
  | "TIMEOUT"
  | "POLICY_BLOCKED"
  | "PROVIDER_FAILURE"
  | "TRANSPORT_DISCONNECTED"
  | "MAX_DURATION"
  | "REJECTED"
  | "NORMAL";

export type UnknownCallerMode =
  | "AUTO_ANSWER"
  | "REJECT"
  | "MANUAL"
  | "ANNOUNCE_AI";

export interface IncomingCall {
  callId: string;
  callerJid: string;
  callerPhone: string;
  callerName?: string;
  timestamp: number;
  isGroup: boolean;
  offerData?: unknown;
}

export interface CallPolicy {
  autoAnswerEnabled: boolean;
  allowedContacts: string[];
  blockedContacts: string[];
  allowedGroups: string[];
  unknownCallerMode: UnknownCallerMode;
  businessHoursOnly: boolean;
  maxCallDurationMs: number;
  maxConcurrentCalls: number;
  aiDisclosure: string;
  recordingEnabled: boolean;
  silenceTimeoutMs: number;
  thinkingCooldownMs: number;
}

export interface AudioChunk {
  pcm: Float32Array; // Canonical 16kHz mono Float32 PCM [-1.0, 1.0]
  sampleRate: number;
  channels: number;
  timestamp: number;
  isSilence?: boolean;
}

export interface VoiceTurn {
  turnId: string;
  speaker: "caller" | "bot";
  text: string;
  language: "hi" | "hi-en" | "en" | "unknown";
  confidence: number;
  startedAt: number;
  endedAt?: number;
  interrupted?: boolean;
}

export interface CallLatencyMetrics {
  vadMs: number;
  asrMs: number;
  llmMs: number;
  ttsFirstByteMs: number;
  totalTurnMs: number;
}

export interface CallMetrics {
  callId: string;
  callerPhone: string;
  startedAt: number;
  answeredAt?: number;
  endedAt?: number;
  durationMs: number;
  turns: VoiceTurn[];
  bargeInCount: number;
  latencies: CallLatencyMetrics[];
  status: CallState;
  endReason?: CallEndReason;
  failureReason?: string;
  costEstimatedUsd: number;
}

export interface CallLogRecord {
  callId: string;
  conversationId: string;
  caller: string;
  callerName?: string;
  startedAt: string;
  answeredAt?: string;
  endedAt: string;
  durationSeconds: number;
  status: CallState;
  endReason: CallEndReason;
  language: string;
  turnCount: number;
  toolCount: number;
  bargeInCount: number;
  failureReason?: string;
  averageLatencyMs: number;
}

export interface SpokenResponseContext {
  callId: string;
  callerPhone: string;
  callerName?: string;
  turns: VoiceTurn[];
  currentUtterance: string;
  detectedLanguage: "hi" | "hi-en" | "en" | "unknown";
  languageConfidence: number;
  recentChatHistory?: Array<{ role: "user" | "assistant"; text: string }>;
  verifiedFacts?: string[];
}

export interface VoiceOptions {
  voice?: string;
  language?: "hi" | "en" | "hi-en";
  speed?: number;
  pitch?: number;
  timeoutMs?: number;
}
