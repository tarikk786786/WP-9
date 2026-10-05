/**
 * Transport disconnect grace period and reconnect handler.
 */

export class CallDisconnectWatcher {
  private disconnectTimer?: NodeJS.Timeout;
  private readonly gracePeriodMs: number;
  private readonly onDisconnectTimeout: () => void;

  constructor(gracePeriodMs: number = 5000, onDisconnectTimeout: () => void) {
    this.gracePeriodMs = gracePeriodMs;
    this.onDisconnectTimeout = onDisconnectTimeout;
  }

  public onTransportInterrupted(): void {
    if (this.disconnectTimer) return; // already timing out

    this.disconnectTimer = setTimeout(() => {
      this.disconnectTimer = undefined;
      this.onDisconnectTimeout();
    }, this.gracePeriodMs);
  }

  public onTransportRestored(): void {
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = undefined;
    }
  }

  public cancel(): void {
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = undefined;
    }
  }
}
