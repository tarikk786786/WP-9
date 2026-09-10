export type OutboxStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'dead_letter';

export interface OutboxItem {
  id: string;
  chatJid: string;
  text: string;
  status: OutboxStatus;
  attempts: number;
  maxAttempts: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
  metadata?: Record<string, unknown>;
}

export type OutboxSender = (chatJid: string, text: string) => Promise<void>;

export class OutboxQueue {
  private queue: Map<string, OutboxItem> = new Map();
  private isProcessing: boolean = false;
  private sender: OutboxSender | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Background polling interval for retries
    this.timer = setInterval(() => {
      void this.processQueue();
    }, 2500);
  }

  public setSender(sender: OutboxSender) {
    this.sender = sender;
  }

  public enqueue(chatJid: string, text: string, metadata?: Record<string, unknown>): OutboxItem {
    const id = "outbox_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
    const item: OutboxItem = {
      id,
      chatJid,
      text,
      status: 'pending',
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata,
    };

    this.queue.set(id, item);
    // Trigger immediate drain
    void this.processQueue();
    return item;
  }

  public async processQueue() {
    if (this.isProcessing || !this.sender) return;
    this.isProcessing = true;

    try {
      for (const [id, item] of this.queue.entries()) {
        if (item.status === 'pending' || item.status === 'failed') {
          if (item.attempts >= item.maxAttempts) {
            item.status = 'dead_letter';
            item.updatedAt = new Date().toISOString();
            continue;
          }

          item.status = 'sending';
          item.attempts++;
          item.updatedAt = new Date().toISOString();

          try {
            await this.sender(item.chatJid, item.text);
            item.status = 'sent';
            item.sentAt = new Date().toISOString();
            item.updatedAt = new Date().toISOString();

            // Keep sent items briefly for tracking, then evict
            setTimeout(() => this.queue.delete(id), 60_000);
          } catch (err) {
            item.error = err instanceof Error ? err.message : String(err);
            item.updatedAt = new Date().toISOString();

            if (item.attempts >= item.maxAttempts) {
              item.status = 'dead_letter';
              console.error(`[outbox] Message ${id} moved to DEAD_LETTER after ${item.attempts} attempts:`, item.error);
            } else {
              item.status = 'failed';
              console.warn(`[outbox] Message ${id} failed attempt ${item.attempts}. Will retry:`, item.error);
            }
          }
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  public retryDeadLetters(): number {
    let retried = 0;
    for (const item of this.queue.values()) {
      if (item.status === 'dead_letter') {
        item.status = 'pending';
        item.attempts = 0;
        item.updatedAt = new Date().toISOString();
        retried++;
      }
    }
    if (retried > 0) void this.processQueue();
    return retried;
  }

  public getSnapshot() {
    const items = Array.from(this.queue.values());
    return {
      total: items.length,
      pending: items.filter((i) => i.status === 'pending').length,
      sending: items.filter((i) => i.status === 'sending').length,
      sent: items.filter((i) => i.status === 'sent').length,
      failed: items.filter((i) => i.status === 'failed').length,
      deadLetters: items.filter((i) => i.status === 'dead_letter').length,
      recentItems: items.slice(-10),
    };
  }
}

export const messageOutbox = new OutboxQueue();
