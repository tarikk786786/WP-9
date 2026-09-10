export type ConnectionState =
  | 'STARTING'
  | 'CONNECTING'
  | 'QR_REQUIRED'
  | 'AUTHENTICATING'
  | 'CONNECTED'
  | 'DEGRADED'
  | 'RECONNECTING'
  | 'LOGGED_OUT'
  | 'AUTH_EXPIRED'
  | 'BANNED_OR_BLOCKED'
  | 'FATAL_ERROR';

export type StateChangeEvent = {
  previous: ConnectionState;
  current: ConnectionState;
  reason?: string;
  timestamp: string;
};

export class WhatsAppStateMachine {
  private state: ConnectionState = 'STARTING';
  private lastChangedAt: number = Date.now();
  private history: StateChangeEvent[] = [];
  private listeners: Array<(event: StateChangeEvent) => void> = [];

  constructor(initialState: ConnectionState = 'STARTING') {
    this.state = initialState;
  }

  public get currentState(): ConnectionState {
    return this.state;
  }

  public get durationInCurrentStateMs(): number {
    return Date.now() - this.lastChangedAt;
  }

  public get isOnline(): boolean {
    return this.state === 'CONNECTED';
  }

  public get requiresUserAction(): boolean {
    return this.state === 'QR_REQUIRED' || this.state === 'LOGGED_OUT' || this.state === 'BANNED_OR_BLOCKED';
  }

  public transition(next: ConnectionState, reason?: string): boolean {
    if (this.state === next) return false;

    const event: StateChangeEvent = {
      previous: this.state,
      current: next,
      reason,
      timestamp: new Date().toISOString(),
    };

    this.state = next;
    this.lastChangedAt = Date.now();
    this.history.unshift(event);
    if (this.history.length > 50) this.history.pop();

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[state-machine] Listener error:', err);
      }
    }

    return true;
  }

  public onStateChange(listener: (event: StateChangeEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public getAuditHistory(): StateChangeEvent[] {
    return [...this.history];
  }

  public getSnapshot() {
    return {
      state: this.state,
      isOnline: this.isOnline,
      requiresAction: this.requiresUserAction,
      durationMs: this.durationInCurrentStateMs,
      historyCount: this.history.length,
    };
  }
}

export const connectionStateMachine = new WhatsAppStateMachine();
