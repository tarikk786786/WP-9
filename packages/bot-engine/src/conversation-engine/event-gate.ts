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

export function isLiveInboundConversationEvent(event: InboundEventPayload & {
  fromMe?: boolean;
  source?: string;
  isEdit?: boolean;
  isProtocol?: boolean;
}): {
  isLive: boolean;
  reason?: string;
} {
  // 1. Not our own message
  if (event.fromMe || event.sender === "me") {
    return { isLive: false, reason: "OWN_OUTBOUND_EVENT" };
  }

  // 2. Not message edit / update event
  if (event.isEdit || event.source === "update") {
    return { isLive: false, reason: "MESSAGE_UPDATE_EVENT" };
  }

  // 3. Not history replay / catchup sync
  if (event.source && event.source !== "notify") {
    return { isLive: false, reason: "HISTORY_REPLAY_SYNC" };
  }

  // 4. Not status update / broadcast
  if (event.chatId.endsWith("@broadcast") || event.chatId.includes("status@broadcast")) {
    return { isLive: false, reason: "BROADCAST_STATUS_UPDATE" };
  }

  // 5. Not protocol or control event
  if (event.isProtocol || event.mediaType === "protocol") {
    return { isLive: false, reason: "PROTOCOL_CONTROL_EVENT" };
  }

  // 6. Recency check (live event within maxAgeMs, default 5 minutes)
  const now = Date.now();
  const ageMs = now - event.timestamp;
  const maxAgeMs = (event as { maxAgeMs?: number }).maxAgeMs ?? 300_000;
  if (ageMs > maxAgeMs || ageMs < -60_000) {
    return { isLive: false, reason: "STALE_MESSAGE_TIMED_OUT" };
  }

  return { isLive: true };
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
   * Accepts an inbound event only if it is a genuine live message and passes deduplication.
   * Returns { accepted: boolean, eventId: string, reason?: string }
   */
  public async acceptEvent(
    event: InboundEventPayload & { fromMe?: boolean; source?: string; isEdit?: boolean; isProtocol?: boolean }
  ): Promise<{ accepted: boolean; eventId: string; reason?: string }> {
    const eventId = this.generateEventId(event.tenantId, event.chatId, event.messageId);

    // 1. Strict live message verification
    const liveCheck = isLiveInboundConversationEvent(event);
    if (!liveCheck.isLive) {
      return { accepted: false, eventId, reason: liveCheck.reason };
    }

    // 2. In-memory Gate status check (only for currently processing or processed in this process)
    const existing = this.events.get(eventId);
    if (existing) {
      if (existing.status === "PROCESSED") {
        return { accepted: false, eventId, reason: "Event already PROCESSED" };
      }
      if (existing.status === "PROCESSING" && Date.now() - existing.updatedAt < 30_000) {
        return { accepted: false, eventId, reason: "Event currently PROCESSING" };
      }
      if (existing.status === "FAILED" && Date.now() - existing.updatedAt < 3000) {
        return { accepted: false, eventId, reason: "Event failed recently, backoff active" };
      }
    }

    // 3. Multi-layer deduplication check across DB and memory
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

    // 4. Atomically record and leased claim inbound event
    const claimed = await this.dedup.recordInbound({
      messageId: event.messageId,
      eventId,
      chatId: event.chatId,
      senderId: event.sender,
      text: event.text,
      timestamp: event.timestamp,
    });

    if (!claimed) {
      return { accepted: false, eventId, reason: "Message lease actively held by another worker" };
    }

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
