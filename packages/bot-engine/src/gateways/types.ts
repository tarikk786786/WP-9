import type { NormalizedMessage } from "@bot/shared";

export interface OutboundMessageOptions {
  quotedId?: string;
  ephemeralExpiration?: number;
}

export interface MediaPayload {
  type: "image" | "audio" | "video" | "document";
  buffer: Buffer;
  caption?: string;
  mimetype?: string;
  filename?: string;
}

export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

export interface ProviderHealth {
  connected: boolean;
  provider: string;
  phone?: string | null;
  error?: string | null;
}

export interface WhatsAppProvider {
  readonly name: string;
  initialize(): Promise<void>;
  sendTextMessage(to: string, text: string, options?: OutboundMessageOptions): Promise<SendResult>;
  sendMediaMessage(to: string, media: MediaPayload, options?: OutboundMessageOptions): Promise<SendResult>;
  onMessage(handler: (msg: NormalizedMessage) => Promise<void>): void;
  getHealth(): ProviderHealth;
  disconnect(): Promise<void>;
}
