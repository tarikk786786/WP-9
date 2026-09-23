import type { NormalizedMessage } from "@bot/shared";
import type { WhatsAppProvider, OutboundMessageOptions, MediaPayload, SendResult, ProviderHealth } from "./types.ts";

export interface BaileysAdapterDelegate {
  sendText(jid: string, text: string, options?: { quotedId?: string; ephemeralExpiration?: number }): Promise<string>;
  sendMedia?(jid: string, media: MediaPayload, options?: { quotedId?: string; ephemeralExpiration?: number }): Promise<string>;
  getPhone?(): string | null;
  isConnected?(): boolean;
  disconnect?(): Promise<void>;
}

export class BaileysProvider implements WhatsAppProvider {
  readonly name = "baileys";
  private delegate?: BaileysAdapterDelegate;
  private messageHandlers: Array<(msg: NormalizedMessage) => Promise<void>> = [];

  constructor(delegate?: BaileysAdapterDelegate) {
    this.delegate = delegate;
  }

  public setDelegate(delegate: BaileysAdapterDelegate): void {
    this.delegate = delegate;
  }

  public async initialize(): Promise<void> {
    // Initialized via delegate lifecycle
  }

  public async sendTextMessage(
    to: string,
    text: string,
    options?: OutboundMessageOptions
  ): Promise<SendResult> {
    if (!this.delegate) {
      return { ok: false, error: "Baileys adapter delegate not attached" };
    }
    try {
      const messageId = await this.delegate.sendText(to, text, {
        quotedId: options?.quotedId,
        ephemeralExpiration: options?.ephemeralExpiration,
      });
      return { ok: true, messageId };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  public async sendMediaMessage(
    to: string,
    media: MediaPayload,
    options?: OutboundMessageOptions
  ): Promise<SendResult> {
    if (!this.delegate || !this.delegate.sendMedia) {
      return { ok: false, error: "Baileys media sending not available in current delegate" };
    }
    try {
      const messageId = await this.delegate.sendMedia(to, media, {
        quotedId: options?.quotedId,
        ephemeralExpiration: options?.ephemeralExpiration,
      });
      return { ok: true, messageId };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  public onMessage(handler: (msg: NormalizedMessage) => Promise<void>): void {
    this.messageHandlers.push(handler);
  }

  public async emitMessage(msg: NormalizedMessage): Promise<void> {
    for (const handler of this.messageHandlers) {
      try {
        await handler(msg);
      } catch (err) {
        console.error("[BaileysProvider] Message handler error:", err);
      }
    }
  }

  public getHealth(): ProviderHealth {
    const connected = this.delegate?.isConnected ? this.delegate.isConnected() : true;
    const phone = this.delegate?.getPhone ? this.delegate.getPhone() : null;
    return {
      connected,
      provider: this.name,
      phone,
    };
  }

  public async disconnect(): Promise<void> {
    if (this.delegate?.disconnect) {
      await this.delegate.disconnect();
    }
  }
}
