export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  name: string;
  failureThreshold?: number; // Failures before opening
  recoveryTimeoutMs?: number; // Time in OPEN state before trying HALF_OPEN
  successThreshold?: number; // Successes in HALF_OPEN to transition to CLOSED
}

export class CircuitBreaker {
  public readonly name: string;
  private state: CircuitState = 'CLOSED';
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number = 0;
  private lastStateChange: number = Date.now();
  private readonly failureThreshold: number;
  private readonly recoveryTimeoutMs: number;
  private readonly successThreshold: number;

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.recoveryTimeoutMs = options.recoveryTimeoutMs ?? 30_000;
    this.successThreshold = options.successThreshold ?? 2;
  }

  public get currentState(): CircuitState {
    this.evaluateState();
    return this.state;
  }

  public get isOpen(): boolean {
    return this.currentState === 'OPEN';
  }

  public get isHealthy(): boolean {
    return this.currentState === 'CLOSED';
  }

  private evaluateState() {
    if (this.state === 'OPEN') {
      const elapsed = Date.now() - this.lastStateChange;
      if (elapsed >= this.recoveryTimeoutMs) {
        this.state = 'HALF_OPEN';
        this.lastStateChange = Date.now();
        this.successCount = 0;
      }
    }
  }

  public recordSuccess() {
    this.evaluateState();
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.successCount = 0;
        this.lastStateChange = Date.now();
      }
    } else if (this.state === 'CLOSED') {
      this.failureCount = Math.max(0, this.failureCount - 1);
    }
  }

  public recordFailure() {
    this.lastFailureTime = Date.now();
    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.lastStateChange = Date.now();
      this.successCount = 0;
    } else if (this.state === 'CLOSED') {
      this.failureCount++;
      if (this.failureCount >= this.failureThreshold) {
        this.state = 'OPEN';
        this.lastStateChange = Date.now();
      }
    }
  }

  public async execute<T>(fn: () => Promise<T>, fallbackFn?: () => Promise<T>): Promise<T> {
    if (this.isOpen) {
      if (fallbackFn) return fallbackFn();
      throw new Error(`CircuitBreaker [${this.name}] is OPEN. Operation rejected to prevent failure cascade.`);
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (err) {
      this.recordFailure();
      if (fallbackFn) {
        return fallbackFn();
      }
      throw err;
    }
  }

  public reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastStateChange = Date.now();
  }

  public getSnapshot() {
    this.evaluateState();
    return {
      name: this.name,
      state: this.state,
      failures: this.failureCount,
      isOpen: this.state === 'OPEN',
      lastFailureTime: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : null,
      lastStateChange: new Date(this.lastStateChange).toISOString(),
    };
  }
}

export const aiCircuitBreaker = new CircuitBreaker({ name: 'ai-provider', failureThreshold: 4, recoveryTimeoutMs: 25_000 });
export const whatsappCircuitBreaker = new CircuitBreaker({ name: 'whatsapp-socket', failureThreshold: 3, recoveryTimeoutMs: 15_000 });
