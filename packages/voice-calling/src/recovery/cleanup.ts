/**
 * Call resource cleanup coordinator.
 * Ensures zero memory leaks, clearing of intervals/timers, closing of streams.
 */

export interface DisposableResource {
  dispose: () => void | Promise<void>;
  name?: string;
}

export class CallCleanupManager {
  private readonly resources: DisposableResource[] = [];
  private isCleanedUp = false;

  public register(resource: DisposableResource): void {
    if (this.isCleanedUp) {
      try {
        void resource.dispose();
      } catch (err) {
        console.error("[CallCleanupManager] Error disposing resource registered after cleanup:", err);
      }
      return;
    }
    this.resources.push(resource);
  }

  public registerTimer(timer: NodeJS.Timeout | ReturnType<typeof setTimeout>): void {
    this.register({
      name: "timer",
      dispose: () => clearTimeout(timer),
    });
  }

  public registerInterval(interval: NodeJS.Timeout | ReturnType<typeof setInterval>): void {
    this.register({
      name: "interval",
      dispose: () => clearInterval(interval),
    });
  }

  public async cleanup(): Promise<void> {
    if (this.isCleanedUp) return;
    this.isCleanedUp = true;

    while (this.resources.length > 0) {
      const res = this.resources.pop();
      if (!res) continue;
      try {
        await res.dispose();
      } catch (err) {
        console.error(`[CallCleanupManager] Error disposing resource ${res.name || "unknown"}:`, err);
      }
    }
  }

  public isDone(): boolean {
    return this.isCleanedUp;
  }
}
