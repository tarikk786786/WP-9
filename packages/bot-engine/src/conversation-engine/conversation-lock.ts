import crypto from "node:crypto";
import { acquireChatLockDb, releaseChatLockDb } from "@bot/database";

export interface ConversationLockInfo {
  chatId: string;
  turnId: string;
  ownerId: string;
  lockedAt: number;
  expiresAt: number;
}

export class ConversationLockManager {
  private localLocks: Map<string, ConversationLockInfo> = new Map();
  private renewalTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private readonly defaultTtlMs: number;
  private readonly instanceOwnerId: string;

  constructor(defaultTtlMs = 25_000) {
    this.defaultTtlMs = defaultTtlMs;
    this.instanceOwnerId = `worker_${process.pid}_${crypto.randomBytes(4).toString("hex")}`;
  }

  /**
   * Acquire a single-flight conversation lock for a specific chat.
   * Guarantees that only ONE turn processor generates a response for this chat.
   */
  public async acquireLock(chatId: string, turnId: string, ttlMs?: number): Promise<string | null> {
    const ttl = ttlMs ?? this.defaultTtlMs;
    const now = Date.now();

    // 1. In-process check
    const local = this.localLocks.get(chatId);
    if (local && local.expiresAt > now) {
      // Chat is already locked by an active turn
      return null;
    }

    // 2. Database distributed lock check
    const acquiredDb = await acquireChatLockDb(chatId, turnId, this.instanceOwnerId, ttl);
    if (!acquiredDb) {
      return null;
    }

    const lockInfo: ConversationLockInfo = {
      chatId,
      turnId,
      ownerId: this.instanceOwnerId,
      lockedAt: now,
      expiresAt: now + ttl,
    };
    this.localLocks.set(chatId, lockInfo);

    // Heartbeat renewal timer every half-TTL
    const renewInterval = Math.max(3000, Math.floor(ttl / 2));
    const timer = setInterval(() => {
      void this.renewLock(chatId, turnId, ttl);
    }, renewInterval);
    if (timer && typeof timer.unref === "function") {
      timer.unref();
    }
    this.renewalTimers.set(chatId, timer);

    return this.instanceOwnerId;
  }

  public async renewLock(chatId: string, turnId: string, ttlMs: number): Promise<boolean> {
    const local = this.localLocks.get(chatId);
    if (!local || local.turnId !== turnId || local.ownerId !== this.instanceOwnerId) {
      return false;
    }
    local.expiresAt = Date.now() + ttlMs;
    return await acquireChatLockDb(chatId, turnId, this.instanceOwnerId, ttlMs);
  }

  public async releaseLock(chatId: string, turnId: string): Promise<void> {
    const timer = this.renewalTimers.get(chatId);
    if (timer) {
      clearInterval(timer);
      this.renewalTimers.delete(chatId);
    }

    this.localLocks.delete(chatId);
    await releaseChatLockDb(chatId, turnId, this.instanceOwnerId);
  }

  public isLocked(chatId: string): boolean {
    const local = this.localLocks.get(chatId);
    if (!local) return false;
    if (local.expiresAt <= Date.now()) {
      this.localLocks.delete(chatId);
      return false;
    }
    return true;
  }

  public clear() {
    for (const timer of this.renewalTimers.values()) {
      clearInterval(timer);
    }
    this.renewalTimers.clear();
    this.localLocks.clear();
  }
}

export const conversationLock = new ConversationLockManager();
