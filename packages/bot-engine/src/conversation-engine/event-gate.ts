import { deduplicator, type MultiLayerDeduplicator } from "./deduplicator.ts";

export type EventGateStatus = "RECEIVED" | "PROCESSING" | "PROCESSED" | "FAILED" | "DUPLICATE_IGNORED";

export interface InboundEventPayload {
  tenantId: string;
  chatId: string;
  messageId: string;
  text: string;
  sender: string;
  fromName?: string;
  timestamp: number;
  quoted?: {
    id?: string;
    text: string;
    sender?: string;
    fromMe?: boolean;
  };
  isGroup?: boolean;
  mediaType?: string;
}

export interface InboundEventRecord {
  eventId: string;
  messageId: string;
  tenantId: string;
  chatId: string;
  sender: string;
  status: EventGateStatus;
  receivedAt: number;
  updatedAt: number;
  error?: string;
}

export class EventGate {
  private events: Map<string, InboundEventRecord> = new Map();
  private dedup: MultiLayerDeduplicator;

  constructor(dedup = deduplicator) {
    this.dedup = dedup;
  }

  public generateEventId(tenantId: string, chatId: string, messageId: string): string {
    return `evt_${tenantId}_${chatId}_${messageId}`;
  }

  /**
   * Accepts an inbound event only if it passes all 3 deduplication layers.
   * Returns { accepted: boolean, eventId: string, reason?: string }
   */
  public async acceptEvent(
    event: InboundEventPayload
  ): Promise<{ accepted: boolean; eventId: string; reason?: string }> {
    const eventId = this.generateEventId(event.tenantId, event.chatId, event.messageId);

    // 1. In-memory Gate status check
    const existing = this.events.get(eventId);
    if (existing) {
      if (existing.status === "PROCESSING" || existing.status === "PROCESSED" || existing.status === "RECEIVED") {
        return { accepted: false, eventId, reason: `Event already ${existing.status}` };
      }
      if (existing.status === "FAILED" && Date.now() - existing.updatedAt < 5000) {
        return { accepted: false, eventId, reason: "Event failed recently, backoff active" };
      }
    }

    // 2. Multi-layer deduplication check
    const dedupCheck = await this.dedup.isDuplicateInbound({
      messageId: event.messageId,
      eventId,
      chatId: event.chatId,
      senderId: event.sender,
      text: event.text,
      timestamp: event.timestamp,
    });

    if (dedupCheck.isDuplicate) {
      this.events.set(eventId, {
        eventId,
        messageId: event.messageId,
        tenantId: event.tenantId,
        chatId: event.chatId,
        sender: event.sender,
        status: "DUPLICATE_IGNORED",
        receivedAt: Date.now(),
        updatedAt: Date.now(),
      });
      return { accepted: false, eventId, reason: `Duplicate detected at Layer ${dedupCheck.layer}` };
    }

    // 3. Atomically record inbound event in database
    await this.dedup.recordInbound({
      messageId: event.messageId,
      eventId,
      chatId: event.chatId,
      senderId: event.sender,
      text: event.text,
      timestamp: event.timestamp,
    });

    const now = Date.now();
    this.events.set(eventId, {
      eventId,
      messageId: event.messageId,
      tenantId: event.tenantId,
      chatId: event.chatId,
      sender: event.sender,
      status: "RECEIVED",
      receivedAt: now,
      updatedAt: now,
    });

    return { accepted: true, eventId };
  }

  public markProcessing(eventId: string) {
    const record = this.events.get(eventId);
    if (record) {
      record.status = "PROCESSING";
      record.updatedAt = Date.now();
    }
  }

  public markProcessed(eventId: string) {
    const record = this.events.get(eventId);
    if (record) {
      record.status = "PROCESSED";
      record.updatedAt = Date.now();
    }
  }

  public markFailed(eventId: string, error?: string) {
    const record = this.events.get(eventId);
    if (record) {
      record.status = "FAILED";
      record.error = error;
      record.updatedAt = Date.now();
    }
  }

  public clear() {
    this.events.clear();
  }
}

export const eventGate = new EventGate();
