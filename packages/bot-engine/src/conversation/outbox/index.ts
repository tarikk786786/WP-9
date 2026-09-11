export type OutboxItemStatus = "PENDING" | "SENDING" | "SENT" | "FAILED" | "DEAD_LETTER";

export interface OutboxEntry {
  responseId: string;
  tenantId: string;
  chatId: string;
  text: string;
  status: OutboxItemStatus;
  attempts: number;
  maxAttempts: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
  sentAt?: number;
  metadata?: Record<string, unknown>;
}

export type OutboundSender = (
  chatId: string,
  text: string,
  metadata?: Record<string, unknown>
) => Promise<void>;

export class IdempotentOutbox {
  private queue: Map<string, OutboxEntry> = new Map();
  private sender: OutboundSender | null = null;
  private isProcessing = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.timer = setInterval(() => {
      void this.processQueue();
    }, 2000);
    if (this.timer && typeof this.timer.unref === "function") {
      this.timer.unref();
    }
  }

  public setSender(sender: OutboundSender) {
    this.sender = sender;
  }

  private makeKey(tenantId: string, chatId: string, responseId: string): string {
    return `${tenantId}:${chatId}:${responseId}`;
  }

  /**
   * Enqueue an outbound message for sending.
   * If an item with the same tenantId + chatId + responseId already exists and is SENT or SENDING,
   * it is strictly deduplicated.
   */
  public enqueue(params: {
    tenantId: string;
    chatId: string;
    responseId: string;
    text: string;
    metadata?: Record<string, unknown>;
    maxAttempts?: number;
  }): { entry: OutboxEntry; isDuplicate: boolean } {
    const key = this.makeKey(params.tenantId, params.chatId, params.responseId);
    const existing = this.queue.get(key);

    if (existing) {
      if (existing.status === "SENT" || existing.status === "SENDING") {
        return { entry: existing, isDuplicate: true };
      }
      if (existing.status === "FAILED" && existing.attempts < existing.maxAttempts) {
        existing.status = "PENDING";
        existing.updatedAt = Date.now();
        void this.processQueue();
        return { entry: existing, isDuplicate: true };
      }
      return { entry: existing, isDuplicate: true };
    }

    const now = Date.now();
    const entry: OutboxEntry = {
      responseId: params.responseId,
      tenantId: params.tenantId,
      chatId: params.chatId,
      text: params.text,
      status: "PENDING",
      attempts: 0,
      maxAttempts: params.maxAttempts ?? 3,
      createdAt: now,
      updatedAt: now,
      metadata: params.metadata,
    };

    this.queue.set(key, entry);
    void this.processQueue();
    return { entry, isDuplicate: false };
  }

  public async processQueue() {
    if (this.isProcessing || !this.sender) return;
    this.isProcessing = true;

    try {
      const now = Date.now();
      for (const [key, item] of this.queue.entries()) {
        if (item.status === "PENDING" || (item.status === "FAILED" && item.attempts < item.maxAttempts)) {
          item.status = "SENDING";
          item.attempts += 1;
          item.updatedAt = Date.now();

          try {
            await this.sender(item.chatId, item.text, item.metadata);
            item.status = "SENT";
            item.sentAt = Date.now();
            item.updatedAt = Date.now();

            // Evict sent item after 5 minutes
            setTimeout(() => {
              this.queue.delete(key);
            }, 300_000);
          } catch (err) {
            item.error = err instanceof Error ? err.message : String(err);
            item.updatedAt = Date.now();

            if (item.attempts >= item.maxAttempts) {
              item.status = "DEAD_LETTER";
              console.error(`[outbox] Message ${key} moved to DEAD_LETTER after ${item.attempts} attempts:`, item.error);
            } else {
              item.status = "FAILED";
              console.warn(`[outbox] Message ${key} failed attempt ${item.attempts}. Will retry:`, item.error);
            }
          }
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  public getItem(tenantId: string, chatId: string, responseId: string): OutboxEntry | null {
    return this.queue.get(this.makeKey(tenantId, chatId, responseId)) ?? null;
  }

  public getAll(): OutboxEntry[] {
    return Array.from(this.queue.values());
  }

  public clear() {
    this.queue.clear();
  }
}

export const idempotentOutbox = new IdempotentOutbox();
