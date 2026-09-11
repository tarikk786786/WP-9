export type EventStatus = "RECEIVED" | "PROCESSING" | "PROCESSED" | "FAILED";

export interface InboundEventRecord {
  key: string;
  tenantId: string;
  chatId: string;
  messageId: string;
  status: EventStatus;
  receivedAt: number;
  updatedAt: number;
  error?: string;
}

export class EventGate {
  private events: Map<string, InboundEventRecord> = new Map();
  private chatLocks: Map<string, { lockedAt: number; lockId: string }> = new Map();
  private readonly ttlMs: number;

  constructor(ttlMs = 120_000) {
    this.ttlMs = ttlMs;
    // Periodic sweep
    if (typeof setInterval !== "undefined") {
      const timer = setInterval(() => this.sweep(), 60_000);
      if (timer && typeof timer.unref === "function") timer.unref();
    }
  }

  public generateEventKey(tenantId: string, chatId: string, messageId: string): string {
    return `${tenantId}:${chatId}:${messageId}`;
  }

  /**
   * Returns true if event is NEW and eligible for processing.
   * Returns false if duplicate, already processing, or already processed.
   */
  public acceptEvent(tenantId: string, chatId: string, messageId: string): boolean {
    const key = this.generateEventKey(tenantId, chatId, messageId);
    const existing = this.events.get(key);

    if (existing) {
      if (existing.status === "RECEIVED" || existing.status === "PROCESSING" || existing.status === "PROCESSED") {
        return false;
      }
      // If failed recently, retry after short backoff
      if (existing.status === "FAILED" && Date.now() - existing.updatedAt < 5000) {
        return false;
      }
    }

    const now = Date.now();
    this.events.set(key, {
      key,
      tenantId,
      chatId,
      messageId,
      status: "RECEIVED",
      receivedAt: existing?.receivedAt ?? now,
      updatedAt: now,
    });

    return true;
  }

  public markProcessing(tenantId: string, chatId: string, messageId: string): boolean {
    const key = this.generateEventKey(tenantId, chatId, messageId);
    const record = this.events.get(key);
    if (!record) return false;
    record.status = "PROCESSING";
    record.updatedAt = Date.now();
    return true;
  }

  public markProcessed(tenantId: string, chatId: string, messageId: string) {
    const key = this.generateEventKey(tenantId, chatId, messageId);
    const record = this.events.get(key);
    if (record) {
      record.status = "PROCESSED";
      record.updatedAt = Date.now();
    }
  }

  public markFailed(tenantId: string, chatId: string, messageId: string, error?: string) {
    const key = this.generateEventKey(tenantId, chatId, messageId);
    const record = this.events.get(key);
    if (record) {
      record.status = "FAILED";
      record.error = error;
      record.updatedAt = Date.now();
    }
  }

  public getStatus(tenantId: string, chatId: string, messageId: string): EventStatus | null {
    const key = this.generateEventKey(tenantId, chatId, messageId);
    return this.events.get(key)?.status ?? null;
  }

  // --- Single-Flight Chat Lock ---
  public acquireChatLock(chatId: string, lockTtlMs = 25_000): string | null {
    const now = Date.now();
    const existing = this.chatLocks.get(chatId);
    if (existing && now - existing.lockedAt < lockTtlMs) {
      return null; // Locked by another active flight
    }
    const lockId = `lock_${now}_${Math.random().toString(36).slice(2, 7)}`;
    this.chatLocks.set(chatId, { lockedAt: now, lockId });
    return lockId;
  }

  public releaseChatLock(chatId: string, lockId: string) {
    const existing = this.chatLocks.get(chatId);
    if (existing && existing.lockId === lockId) {
      this.chatLocks.delete(chatId);
    }
  }

  public isChatLocked(chatId: string, lockTtlMs = 25_000): boolean {
    const existing = this.chatLocks.get(chatId);
    return Boolean(existing && Date.now() - existing.lockedAt < lockTtlMs);
  }

  private sweep() {
    const now = Date.now();
    for (const [key, record] of this.events.entries()) {
      if (now - record.updatedAt > this.ttlMs) {
        this.events.delete(key);
      }
    }
    for (const [chatId, lock] of this.chatLocks.entries()) {
      if (now - lock.lockedAt > 60_000) {
        this.chatLocks.delete(chatId);
      }
    }
  }

  public clear() {
    this.events.clear();
    this.chatLocks.clear();
  }
}

export const eventGate = new EventGate();
