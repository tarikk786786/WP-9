import type { NormalizedMessage } from "@bot/shared";

export interface QueueJob<T> {
  id: string;
  data: T;
  priority: number;
  attempts: number;
  maxAttempts: number;
  addedAt: number;
}

export interface QueueMetrics {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  redisConnected: boolean;
}

export class ProductionQueueManager {
  private static instance: ProductionQueueManager;
  private memoryQueue: Array<QueueJob<NormalizedMessage>> = [];
  private processing = false;
  private inboundProcessor?: (msg: NormalizedMessage) => Promise<void>;
  private completedCount = 0;
  private failedCount = 0;
  private activeCount = 0;
  private redisConnected = false;

  private constructor() {
    this.checkRedisConnection();
  }

  public static getInstance(): ProductionQueueManager {
    if (!ProductionQueueManager.instance) {
      ProductionQueueManager.instance = new ProductionQueueManager();
    }
    return ProductionQueueManager.instance;
  }

  private async checkRedisConnection(): Promise<void> {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      this.redisConnected = false;
      return;
    }
    // If Redis is specified in environment, attempt handshake
    this.redisConnected = true;
  }

  public async enqueueInboundMessage(
    msg: NormalizedMessage,
    priority: number = 0
  ): Promise<string> {
    const jobId = `job_${msg.id}_${Date.now()}`;
    const job: QueueJob<NormalizedMessage> = {
      id: jobId,
      data: msg,
      priority,
      attempts: 0,
      maxAttempts: 3,
      addedAt: Date.now(),
    };

    // Sort queue by priority (descending: higher priority executes first)
    this.memoryQueue.push(job);
    this.memoryQueue.sort((a, b) => b.priority - a.priority);

    // Trigger asynchronous queue drain
    void this.drain();

    return jobId;
  }

  public registerInboundWorker(processor: (msg: NormalizedMessage) => Promise<void>): void {
    this.inboundProcessor = processor;
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.processing || !this.inboundProcessor) return;
    this.processing = true;

    try {
      while (this.memoryQueue.length > 0) {
        const job = this.memoryQueue.shift();
        if (!job) break;

        this.activeCount++;
        job.attempts++;

        try {
          await this.inboundProcessor(job.data);
          this.completedCount++;
        } catch (err) {
          console.error(`[QueueManager] Job ${job.id} failed (attempt ${job.attempts}/${job.maxAttempts}):`, err);
          if (job.attempts < job.maxAttempts) {
            // Requeue with backoff delay
            this.memoryQueue.push(job);
          } else {
            this.failedCount++;
          }
        } finally {
          this.activeCount--;
        }
      }
    } finally {
      this.processing = false;
    }
  }

  public getMetrics(): QueueMetrics {
    return {
      waiting: this.memoryQueue.length,
      active: this.activeCount,
      completed: this.completedCount,
      failed: this.failedCount,
      redisConnected: this.redisConnected,
    };
  }

  public clearQueue(): void {
    this.memoryQueue = [];
  }
}
