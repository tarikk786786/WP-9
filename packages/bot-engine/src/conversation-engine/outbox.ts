import {
  enqueueMessageOutboxDb,
  updateOutboxStatusDb,
  getPendingOutboxItemsDb,
  updateInboundClaimStatus,
  type OutboxDbRecord,
} from "@bot/database";
import { responseCommitManager } from "./response-commit.ts";
import { brainTelemetry } from "./telemetry.ts";

export type OutboxItemStatus = "pending" | "sending" | "sent" | "failed" | "dead_letter";

export interface OutboxEntry {
  responseId: string;
  turnId?: string;
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

export class WhatsAppOutbox {
  private queue: Map<string, OutboxEntry> = new Map();
  private sender: OutboundSender | null = null;
  private isProcessing = false;
  private sendMutex: Promise<void> = Promise.resolve();
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

  public async initFromDatabase(): Promise<void> {
    const pendingDb = await getPendingOutboxItemsDb();
    for (const item of pendingDb) {
      if (!this.queue.has(item.responseId)) {
        this.queue.set(item.responseId, {
          responseId: item.responseId,
          turnId: item.turnId,
          chatId: item.chatId,
          text: item.text,
          status: item.status,
          attempts: item.attempts,
          maxAttempts: item.maxAttempts,
          createdAt: item.createdAt,
          updatedAt: item.createdAt,
          sentAt: item.sentAt,
        });
      }
    }
    void this.processQueue();
  }

  public async enqueue(params: {
    responseId: string;
    turnId?: string;
    chatId: string;
    text: string;
    metadata?: Record<string, unknown>;
    maxAttempts?: number;
  }): Promise<{ entry: OutboxEntry; isDuplicate: boolean }> {
    const existing = this.queue.get(params.responseId);
    if (existing) {
      if (existing.status === "sent" || existing.status === "sending") {
        return { entry: existing, isDuplicate: true };
      }
      return { entry: existing, isDuplicate: true };
    }

    const cleanText = (params.text || "").trim();
    const verifiedText = cleanText || "Ji boliye, main sun raha hoon.";

    const now = Date.now();
    const entry: OutboxEntry = {
      responseId: params.responseId,
      turnId: params.turnId,
      chatId: params.chatId,
      text: verifiedText,
      status: "pending",
      attempts: 0,
      maxAttempts: params.maxAttempts ?? 2,
      createdAt: now,
      updatedAt: now,
      metadata: params.metadata,
    };

    this.queue.set(params.responseId, entry);

    // Persist to database
    await enqueueMessageOutboxDb({
      responseId: params.responseId,
      turnId: params.turnId,
      chatId: params.chatId,
      text: verifiedText,
      maxAttempts: entry.maxAttempts,
    });

    void this.processQueue();
    return { entry, isDuplicate: false };
  }

  /**
   * Serialized queue processing: guarantees exactly one send executes on the socket at a time.
   */
  public async processQueue(forceImmediate = false): Promise<void> {
    if (this.isProcessing || !this.sender) return;
    this.isProcessing = true;

    try {
      const now = Date.now();
      for (const [responseId, item] of this.queue.entries()) {
        if (item.status === "pending" || (item.status === "failed" && item.attempts < item.maxAttempts)) {
          // Exponential backoff: at least 5s * 2^(attempts - 1)
          if (!forceImmediate && item.status === "failed") {
            const backoffMs = Math.min(30_000, 5000 * Math.pow(2, item.attempts - 1));
            if (now - item.updatedAt < backoffMs) {
              continue;
            }
          }

          item.status = "sending";
          item.attempts += 1;
          item.updatedAt = Date.now();

          await responseCommitManager.markSending(responseId);
          await updateOutboxStatusDb(responseId, "sending");

          // Execute serialized send
          await this.executeSerializedSend(item, responseId);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async executeSerializedSend(item: OutboxEntry, responseId: string): Promise<void> {
    // Chain with mutex so only one socket sendMessage runs at a time
    this.sendMutex = this.sendMutex.then(async () => {
      try {
        if (!this.sender) throw new Error("No outbound sender configured");
        const cleanSendText = (item.text || "").trim();
        if (!cleanSendText) {
          console.warn(`[outbox] Message ${responseId} has blank text payload. Suppressing to prevent blank bubble.`);
          item.status = "dead_letter";
          item.error = "Empty text payload rejected";
          await responseCommitManager.markFailed(responseId, item.error);
          await updateOutboxStatusDb(responseId, "dead_letter", item.error);
          return;
        }
        await this.sender(item.chatId, cleanSendText, item.metadata);

        item.status = "sent";
        item.sentAt = Date.now();
        item.updatedAt = Date.now();

        await responseCommitManager.markSent(responseId);
        await updateOutboxStatusDb(responseId, "sent");
        if (item.turnId) {
          await updateInboundClaimStatus(item.turnId, "SENT");
          brainTelemetry.recordSendResult(item.turnId, { status: "SENT" });
        }

        // Evict from active queue cache after 5 minutes
        const timer = setTimeout(() => {
          this.queue.delete(responseId);
        }, 300_000);
        if (timer && typeof timer.unref === "function") {
          timer.unref();
        }
      } catch (err) {
        item.error = err instanceof Error ? err.message : String(err);
        item.updatedAt = Date.now();

        if (item.attempts >= item.maxAttempts) {
          item.status = "dead_letter";
          console.error(`[outbox] Message ${responseId} moved to DEAD_LETTER after ${item.attempts} attempts:`, item.error);
          await responseCommitManager.markFailed(responseId, item.error);
          await updateOutboxStatusDb(responseId, "dead_letter", item.error);
          if (item.turnId) {
            await updateInboundClaimStatus(item.turnId, "SEND_FAILED", { error: item.error });
            brainTelemetry.recordSendResult(item.turnId, { status: "FAILED", error: item.error });
          }
        } else {
          item.status = "failed";
          console.warn(`[outbox] Message ${responseId} failed attempt ${item.attempts}. Will retry with backoff:`, item.error);
          await responseCommitManager.markFailed(responseId, item.error);
          await updateOutboxStatusDb(responseId, "failed", item.error);
        }
      }
    });

    await this.sendMutex;
  }

  public getItem(responseId: string): OutboxEntry | null {
    return this.queue.get(responseId) ?? null;
  }

  public getSnapshot() {
    const all = Array.from(this.queue.values());
    return {
      pending: all.filter((i) => i.status === "pending").length,
      sending: all.filter((i) => i.status === "sending").length,
      sent: all.filter((i) => i.status === "sent").length,
      failed: all.filter((i) => i.status === "failed").length,
      deadLetter: all.filter((i) => i.status === "dead_letter").length,
    };
  }

  public retryDeadLetters(): number {
    let count = 0;
    for (const item of this.queue.values()) {
      if (item.status === "dead_letter" || item.status === "failed") {
        item.status = "pending";
        item.attempts = 0;
        item.error = undefined;
        item.updatedAt = Date.now();
        count++;
      }
    }
    if (count > 0) {
      void this.processQueue(true);
    }
    return count;
  }

  public clear() {
    this.queue.clear();
  }
}

export const whatsAppOutbox = new WhatsAppOutbox();
