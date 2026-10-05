/**
 * Call rate limiting and concurrency enforcement.
 * Enforces:
 * - Max calls per contact per hour (default: 5)
 * - Cooldown between consecutive calls from same contact (default: 30s)
 * - Maximum concurrent calls across system (default: 1)
 */

export interface RateLimitConfig {
  maxCallsPerHour?: number;
  cooldownSeconds?: number;
  maxConcurrentCalls?: number;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  reason?: "COOLDOWN_ACTIVE" | "HOURLY_LIMIT_EXCEEDED" | "MAX_CONCURRENT_REACHED";
  retryAfterSeconds?: number;
}

export class CallRateLimiter {
  private readonly maxCallsPerHour: number;
  private readonly cooldownSeconds: number;
  private readonly maxConcurrentCalls: number;

  // Track timestamps of calls per contact: jid -> timestamp[]
  private readonly callHistory = new Map<string, number[]>();
  // Track last call end time: jid -> timestamp
  private readonly lastCallEndedAt = new Map<string, number>();
  // Track currently active call IDs
  private readonly activeCalls = new Set<string>();

  constructor(config?: RateLimitConfig) {
    this.maxCallsPerHour = config?.maxCallsPerHour ?? 5;
    this.cooldownSeconds = config?.cooldownSeconds ?? 30;
    this.maxConcurrentCalls = config?.maxConcurrentCalls ?? 1;
  }

  /**
   * Check if a new call from callerJid is allowed right now
   */
  public checkLimit(callerJid: string, now: number = Date.now()): RateLimitCheckResult {
    // 1. Check max concurrent calls
    if (this.activeCalls.size >= this.maxConcurrentCalls) {
      return {
        allowed: false,
        reason: "MAX_CONCURRENT_REACHED",
        retryAfterSeconds: 15,
      };
    }

    // 2. Check cooldown from last call
    const lastEnded = this.lastCallEndedAt.get(callerJid);
    if (lastEnded !== undefined) {
      const elapsedSeconds = (now - lastEnded) / 1000;
      if (elapsedSeconds < this.cooldownSeconds) {
        return {
          allowed: false,
          reason: "COOLDOWN_ACTIVE",
          retryAfterSeconds: Math.ceil(this.cooldownSeconds - elapsedSeconds),
        };
      }
    }

    // 3. Check hourly rate limit
    const oneHourAgo = now - 60 * 60 * 1000;
    const history = (this.callHistory.get(callerJid) || []).filter((ts) => ts > oneHourAgo);
    this.callHistory.set(callerJid, history);

    if (history.length >= this.maxCallsPerHour) {
      const oldestInWindow = history[0];
      const resetInSeconds = Math.ceil((oldestInWindow + 3600 * 1000 - now) / 1000);
      return {
        allowed: false,
        reason: "HOURLY_LIMIT_EXCEEDED",
        retryAfterSeconds: Math.max(1, resetInSeconds),
      };
    }

    return { allowed: true };
  }

  /**
   * Record that a call started
   */
  public recordCallStart(callId: string, callerJid: string, now: number = Date.now()): void {
    this.activeCalls.add(callId);
    const history = this.callHistory.get(callerJid) || [];
    history.push(now);
    this.callHistory.set(callerJid, history);
  }

  /**
   * Record that a call ended
   */
  public recordCallEnd(callId: string, callerJid: string, now: number = Date.now()): void {
    this.activeCalls.delete(callId);
    this.lastCallEndedAt.set(callerJid, now);
  }

  public getActiveCallCount(): number {
    return this.activeCalls.size;
  }

  public reset(): void {
    this.callHistory.clear();
    this.lastCallEndedAt.clear();
    this.activeCalls.clear();
  }
}
