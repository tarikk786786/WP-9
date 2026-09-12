import { connectionStateMachine } from '@bot/engine';
import { acquireWorkerLease, saveWorkerHeartbeat } from '@bot/database';

export interface GuardianConfig {
  heartbeatIntervalMs?: number;
  staleSocketThresholdMs?: number;
  maxConsecutiveFailures?: number;
  instanceId?: string;
  getSnapshot?: () => {
    phase: string;
    connected: boolean;
    phone: string | null;
    qrDataUrl: string | null;
    pairingCode: string | null;
    error: string | null;
  };
}

export class ConnectionGuardian {
  private timer: NodeJS.Timeout | null = null;
  private lastActivityAt: number = Date.now();
  private lastMessageAt: number | null = null;
  private consecutiveFailures: number = 0;
  private instanceId: string;
  private heartbeatIntervalMs: number;
  private staleSocketThresholdMs: number;
  private reconnectCallback: (() => Promise<void>) | null = null;
  private getSnapshotFn: GuardianConfig['getSnapshot'] | null = null;

  constructor(config: GuardianConfig = {}) {
    this.instanceId = config.instanceId || `worker_${process.pid}_${Math.random().toString(36).substring(2, 8)}`;
    this.heartbeatIntervalMs = config.heartbeatIntervalMs || 20_000;
    this.staleSocketThresholdMs = config.staleSocketThresholdMs || 900_000; // 15 minutes (avoids false-positive reconnects during idle periods)
    this.getSnapshotFn = config.getSnapshot || null;
  }

  public setSnapshotGetter(fn: NonNullable<GuardianConfig['getSnapshot']>) {
    this.getSnapshotFn = fn;
  }

  public registerReconnectHandler(fn: () => Promise<void>) {
    this.reconnectCallback = fn;
  }

  public recordActivity() {
    this.lastActivityAt = Date.now();
  }

  public recordMessage() {
    this.lastMessageAt = Date.now();
    this.lastActivityAt = Date.now();
  }

  public start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.heartbeatIntervalMs);
    console.log(`[guardian] ConnectionGuardian started for instance ${this.instanceId}`);
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick() {
    try {
      // 1. Maintain worker lease in Supabase
      const leaseAcquired = await acquireWorkerLease(this.instanceId, 30_000);
      if (!leaseAcquired) {
        console.warn('[guardian] Worker lease held by another active instance. Standing by.');
      }

      // 2. Publish worker heartbeat
      const snap = this.getSnapshotFn ? this.getSnapshotFn() : null;
      const state = connectionStateMachine.currentState;
      const isConnected = snap ? snap.connected : state === 'CONNECTED';

      await saveWorkerHeartbeat({
        phase: (snap?.phase || state || 'idle').toLowerCase(),
        connected: isConnected,
        phone: snap?.phone ?? null,
        pairingCode: snap?.pairingCode ?? null,
        qrDataUrl: snap?.qrDataUrl ?? null,
        error: snap?.error ?? null,
        updatedAt: new Date().toISOString(),
      });

      // 3. Check for stale socket (only if supposed to be connected)
      if (isConnected) {
        const timeSinceActivity = Date.now() - this.lastActivityAt;
        if (timeSinceActivity > this.staleSocketThresholdMs) {
          console.warn(`[guardian] WhatsApp socket inactive for ${Math.floor(timeSinceActivity / 1000)}s. Triggering safe refresh.`);
          if (this.reconnectCallback) {
            await this.reconnectCallback();
          }
        }
      }
      this.consecutiveFailures = 0;
    } catch (err) {
      this.consecutiveFailures += 1;
      console.error('[guardian] Tick failure:', err);
    }
  }

  public getSnapshot() {
    return {
      instanceId: this.instanceId,
      lastActivityAt: new Date(this.lastActivityAt).toISOString(),
      lastMessageAt: this.lastMessageAt ? new Date(this.lastMessageAt).toISOString() : null,
      consecutiveFailures: this.consecutiveFailures,
      active: Boolean(this.timer),
    };
  }
}

export const connectionGuardian = new ConnectionGuardian();

