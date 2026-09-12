import type { ActionPlan } from "./action-types.ts";

export interface PendingConfirmation {
  chatId: string;
  plan: ActionPlan;
  createdAt: number;
  expiresAt: number;
}

export class ConfirmationEngine {
  private pending = new Map<string, PendingConfirmation>();
  private readonly ttlMs: number;

  constructor(ttlMs = 120_000) {
    this.ttlMs = ttlMs; // 2 minutes window to confirm
  }

  public registerPending(chatId: string, plan: ActionPlan): PendingConfirmation {
    const entry: PendingConfirmation = {
      chatId,
      plan,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.ttlMs,
    };
    this.pending.set(chatId, entry);
    return entry;
  }

  public getPending(chatId: string): PendingConfirmation | null {
    const entry = this.pending.get(chatId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.pending.delete(chatId);
      return null;
    }
    return entry;
  }

  public evaluateConfirmationReply(
    chatId: string,
    replyText: string,
  ): { hasPending: boolean; isConfirmed: boolean; plan?: ActionPlan } {
    const entry = this.getPending(chatId);
    if (!entry) {
      return { hasPending: false, isConfirmed: false };
    }

    const clean = replyText.trim().toLowerCase();

    // Affirmative signals
    const affirmativeRegex = /^(haan|ha|han|yes|yep|yeah|sure|kar do|bhej do|ok|theek hai|proceed|confirm|kardo|chalega)\b/i;
    // Negative signals
    const negativeRegex = /^(nahi|nah|no|cancel|mat karo|rehne do|abort|stop|mat kijiye)\b/i;

    if (affirmativeRegex.test(clean)) {
      this.pending.delete(chatId);
      return { hasPending: true, isConfirmed: true, plan: entry.plan };
    }

    if (negativeRegex.test(clean)) {
      this.pending.delete(chatId);
      return { hasPending: true, isConfirmed: false, plan: entry.plan };
    }

    // Ambiguous reply
    return { hasPending: true, isConfirmed: false, plan: entry.plan };
  }

  public clear(chatId: string): void {
    this.pending.delete(chatId);
  }
}

export const confirmationEngine = new ConfirmationEngine();
