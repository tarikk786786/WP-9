import type { NormalizedMessage } from "@bot/shared";
import type { WhatsAppProvider, OutboundMessageOptions, MediaPayload, SendResult, ProviderHealth } from "./types.ts";

export interface EvolutionConfig {
  baseUrl: string;
  apiKey: string;
  instanceName: string;
  webhookSecret?: string;
}

export class EvolutionProvider implements WhatsAppProvider {
  readonly name = "evolution";
  private config: EvolutionConfig;
  private messageHandlers: Array<(msg: NormalizedMessage) => Promise<void>> = [];
  private isConnected = false;
  private connectedPhone: string | null = null;
  private lastError: string | null = null;

  constructor(config: EvolutionConfig) {
    this.config = {
      ...config,
      baseUrl: config.baseUrl.replace(/\/+$/, ""),
    };
  }

  public async initialize(): Promise<void> {
    try {
      await this.checkConnection();
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.isConnected = false;
    }
  }

  private async checkConnection(): Promise<void> {
    const url = `${this.config.baseUrl}/instance/connectionState/${encodeURIComponent(this.config.instanceName)}`;
    const res = await fetch(url, {
      headers: {
        apikey: this.config.apiKey,
      },
    });

    if (!res.ok) {
      this.isConnected = false;
      this.lastError = `Evolution API error: ${res.status} ${res.statusText}`;
      return;
    }

    const data = (await res.json()) as { instance?: { state?: string; ownerJid?: string } };
    const state = data?.instance?.state?.toLowerCase();
    this.isConnected = state === "open" || state === "connected";
    this.connectedPhone = data?.instance?.ownerJid ? data.instance.ownerJid.replace(/[^0-9]/g, "") : null;
    this.lastError = null;
  }

  public async sendTextMessage(
    to: string,
    text: string,
    options?: OutboundMessageOptions
  ): Promise<SendResult> {
    const cleanNumber = to.replace(/[^0-9]/g, "");
    const url = `${this.config.baseUrl}/message/sendText/${encodeURIComponent(this.config.instanceName)}`;

    const body: Record<string, unknown> = {
      number: cleanNumber,
      text,
      delay: 1200,
    };

    if (options?.quotedId) {
      body.quoted = { key: { id: options.quotedId } };
    }

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: this.config.apiKey,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorText = await res.text();
        return { ok: false, error: `Evolution sendText failed (${res.status}): ${errorText}` };
      }

      const data = (await res.json()) as { key?: { id?: string } };
      return { ok: true, messageId: data?.key?.id };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: errorMsg };
    }
  }

  public async sendMediaMessage(
    to: string,
    media: MediaPayload,
    options?: OutboundMessageOptions
  ): Promise<SendResult> {
    const cleanNumber = to.replace(/[^0-9]/g, "");
    const url = `${this.config.baseUrl}/message/sendMedia/${encodeURIComponent(this.config.instanceName)}`;

    const body: Record<string, unknown> = {
      number: cleanNumber,
      mediatype: media.type,
      mimetype: media.mimetype || "application/octet-stream",
      caption: media.caption || "",
      media: media.buffer.toString("base64"),
      fileName: media.filename || "file",
    };

    if (options?.quotedId) {
      body.quoted = { key: { id: options.quotedId } };
    }

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: this.config.apiKey,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorText = await res.text();
        return { ok: false, error: `Evolution sendMedia failed (${res.status}): ${errorText}` };
      }

      const data = (await res.json()) as { key?: { id?: string } };
      return { ok: true, messageId: data?.key?.id };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: errorMsg };
    }
  }

  public onMessage(handler: (msg: NormalizedMessage) => Promise<void>): void {
    this.messageHandlers.push(handler);
  }

  /**
   * Ingest an incoming webhook event payload from Evolution API
   */
  public async handleWebhookPayload(payload: any): Promise<void> {
    if (payload?.event !== "messages.upsert" || !payload?.data) return;

    const data = payload.data;
    const key = data.key;
    if (!key || key.fromMe) return;

    const remoteJid = key.remoteJid || "";
    const isGroup = remoteJid.endsWith("@g.us");
    const sender = key.participant || remoteJid;

    let text = "";
    let type: NormalizedMessage["type"] = "text";

    if (data.message?.conversation) {
      text = data.message.conversation;
      type = "text";
    } else if (data.message?.extendedTextMessage?.text) {
      text = data.message.extendedTextMessage.text;
      type = "text";
    } else if (data.message?.imageMessage) {
      text = data.message.imageMessage.caption || "";
      type = "image";
    } else if (data.message?.audioMessage) {
      type = "audio";
    } else if (data.message?.videoMessage) {
      text = data.message.videoMessage.caption || "";
      type = "video";
    } else if (data.message?.documentMessage) {
      text = data.message.documentMessage.caption || "";
      type = "document";
    }

    const normalized: NormalizedMessage = {
      id: key.id || `evo_${Date.now()}`,
      whatsappMessageId: key.id || `evo_${Date.now()}`,
      sender,
      chatId: remoteJid,
      fromName: data.pushName || "Contact",
      type,
      text,
      timestamp: new Date((data.messageTimestamp || Date.now() / 1000) * 1000).toISOString(),
      isGroup,
      metadata: {
        provider: "evolution",
        raw: data,
      },
    };

    for (const handler of this.messageHandlers) {
      try {
        await handler(normalized);
      } catch (err) {
        console.error("[EvolutionProvider] Error in message handler:", err);
      }
    }
  }

  public getHealth(): ProviderHealth {
    return {
      connected: this.isConnected,
      provider: this.name,
      phone: this.connectedPhone,
      error: this.lastError,
    };
  }

  public async disconnect(): Promise<void> {
    this.isConnected = false;
  }
}
