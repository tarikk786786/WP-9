import crypto from "node:crypto";
import { isMessageDeduped, recordMessageDedup, type MessageDedupRecord } from "@bot/database";

export interface DedupCheckParams {
  messageId: string;
  eventId: string;
  chatId: string;
  senderId: string;
  text: string;
  timestamp: number;
}

export class MultiLayerDeduplicator {
  private memoryMessageIds: Set<string> = new Set();
  private memoryEventIds: Set<string> = new Set();
  private memoryContentHashes: Map<string, number> = new Map();
  private memoryTurnIds: Set<string> = new Set();
  private memoryResponseIds: Set<string> = new Set();

  private readonly maxCacheSize: number;

  constructor(maxCacheSize = 5000) {
    this.maxCacheSize = maxCacheSize;
  }

  public computeContentHash(text: string, senderId: string, chatId: string): string {
    const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");
    return crypto.createHash("sha256").update(`${chatId}:${senderId}:${normalized}`).digest("hex");
  }

  public computeNormalizedHash(text: string): string {
    const normalized = text.trim().toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    return crypto.createHash("sha256").update(normalized).digest("hex");
  }

  /**
   * Check if an inbound message/event is duplicate across:
   * Layer 1: messageId
   * Layer 2: eventId
   * Layer 3: contentHash + sender + chat within 15s
   */
  public async isDuplicateInbound(params: DedupCheckParams): Promise<{ isDuplicate: boolean; layer?: number }> {
    // Layer 1: WhatsApp Message ID
    if (this.memoryMessageIds.has(params.messageId)) {
      return { isDuplicate: true, layer: 1 };
    }

    // Layer 2: Event ID
    if (this.memoryEventIds.has(params.eventId)) {
      return { isDuplicate: true, layer: 2 };
    }

    // Layer 3: Content Hash within short window (15s)
    const contentHash = this.computeContentHash(params.text, params.senderId, params.chatId);
    const lastSeenTime = this.memoryContentHashes.get(contentHash);
    if (lastSeenTime && Date.now() - lastSeenTime < 15_000) {
      return { isDuplicate: true, layer: 3 };
    }

    // Persistent Database Deduplication Check
    const dbDuplicate = await isMessageDeduped({
      messageId: params.messageId,
      eventId: params.eventId,
      contentHash,
      chatId: params.chatId,
      senderId: params.senderId,
      windowMs: 15_000,
    });

    if (dbDuplicate) {
      this.rememberInbound(params.messageId, params.eventId, contentHash);
      return { isDuplicate: true, layer: 1 };
    }

    return { isDuplicate: false };
  }

  /**
   * Record and claim this inbound event atomically
   */
  public async recordInbound(params: DedupCheckParams): Promise<boolean> {
    const contentHash = this.computeContentHash(params.text, params.senderId, params.chatId);
    const normalizedHash = this.computeNormalizedHash(params.text);

    this.rememberInbound(params.messageId, params.eventId, contentHash, params.timestamp);

    const record: MessageDedupRecord = {
      messageId: params.messageId,
      eventId: params.eventId,
      chatId: params.chatId,
      senderId: params.senderId,
      contentHash,
      normalizedHash,
      createdAt: params.timestamp ?? Date.now(),
    };

    return await recordMessageDedup(record);
  }

  public isTurnKnown(turnId: string): boolean {
    return this.memoryTurnIds.has(turnId);
  }

  public recordTurn(turnId: string) {
    this.memoryTurnIds.add(turnId);
    this.pruneSet(this.memoryTurnIds);
  }

  public isResponseKnown(responseId: string): boolean {
    return this.memoryResponseIds.has(responseId);
  }

  public recordResponse(responseId: string) {
    this.memoryResponseIds.add(responseId);
    this.pruneSet(this.memoryResponseIds);
  }

  private rememberInbound(messageId: string, eventId: string, contentHash: string, timestamp?: number) {
    this.memoryMessageIds.add(messageId);
    this.memoryEventIds.add(eventId);
    this.memoryContentHashes.set(contentHash, timestamp ?? Date.now());

    this.pruneSet(this.memoryMessageIds);
    this.pruneSet(this.memoryEventIds);

    if (this.memoryContentHashes.size > this.maxCacheSize) {
      const first = this.memoryContentHashes.keys().next().value;
      if (first) this.memoryContentHashes.delete(first);
    }
  }

  private pruneSet(set: Set<string>) {
    if (set.size > this.maxCacheSize) {
      const first = set.values().next().value;
      if (first) set.delete(first);
    }
  }

  public clear() {
    this.memoryMessageIds.clear();
    this.memoryEventIds.clear();
    this.memoryContentHashes.clear();
    this.memoryTurnIds.clear();
    this.memoryResponseIds.clear();
  }
}

export const deduplicator = new MultiLayerDeduplicator();
