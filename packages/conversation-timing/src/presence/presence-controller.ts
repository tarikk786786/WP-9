/**
 * Presence Controller
 * Authoritative manager for WhatsApp presence updates (composing, recording, paused, available).
 * Manages 10-second presence expiration, renewals, and safe cleanup.
 */

export type PresenceState = 'available' | 'unavailable' | 'composing' | 'recording' | 'paused';

export interface PresenceSession {
  chatId: string;
  state: PresenceState;
  startedAt: number;
  expiresAt: number;
  renewalTimer?: NodeJS.Timeout;
}

export type SendPresenceFn = (chatId: string, state: PresenceState) => Promise<void>;

export class PresenceController {
  private activeSessions = new Map<string, PresenceSession>();
  private sendPresence: SendPresenceFn | null = null;
  private readonly ttlMs = 9000; // 9 seconds (WhatsApp presence drops at ~10s)

  public setAdapter(fn: SendPresenceFn) {
    this.sendPresence = fn;
  }

  public async setPresence(chatId: string, state: PresenceState): Promise<void> {
    this.clearPresence(chatId);

    if (state === 'available' || state === 'unavailable' || state === 'paused') {
      if (this.sendPresence) {
        await this.sendPresence(chatId, state).catch(() => {});
      }
      return;
    }

    const now = Date.now();
    const session: PresenceSession = {
      chatId,
      state,
      startedAt: now,
      expiresAt: now + this.ttlMs,
    };

    if (this.sendPresence) {
      await this.sendPresence(chatId, state).catch(() => {});
    }

    // Set auto-renewal timer if composing or recording
    session.renewalTimer = setTimeout(async () => {
      if (this.activeSessions.get(chatId) === session) {
        if (this.sendPresence) {
          await this.sendPresence(chatId, state).catch(() => {});
        }
      }
    }, 7000);

    this.activeSessions.set(chatId, session);
  }

  public clearPresence(chatId: string): void {
    const session = this.activeSessions.get(chatId);
    if (session) {
      if (session.renewalTimer) clearTimeout(session.renewalTimer);
      this.activeSessions.delete(chatId);
      if (this.sendPresence) {
        void this.sendPresence(chatId, 'paused').catch(() => {});
      }
    }
  }

  public getPresence(chatId: string): PresenceState | undefined {
    return this.activeSessions.get(chatId)?.state;
  }
}

export const presenceController = new PresenceController();
