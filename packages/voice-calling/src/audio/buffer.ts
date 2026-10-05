import { SAMPLES_PER_FRAME } from "./pcm.js";

/**
 * Ring Buffer for continuous Float32 PCM streaming
 */
export class AudioRingBuffer {
  private buffer: Float32Array;
  private readIndex = 0;
  private writeIndex = 0;
  private available = 0;

  constructor(capacity = 16_000 * 5) {
    // 5 seconds default capacity at 16kHz
    this.buffer = new Float32Array(capacity);
  }

  public write(samples: Float32Array): number {
    const toWrite = Math.min(samples.length, this.buffer.length - this.available);
    for (let i = 0; i < toWrite; i++) {
      this.buffer[this.writeIndex] = samples[i];
      this.writeIndex = (this.writeIndex + 1) % this.buffer.length;
    }
    this.available += toWrite;
    return toWrite;
  }

  public read(output: Float32Array): number {
    const toRead = Math.min(output.length, this.available);
    for (let i = 0; i < toRead; i++) {
      output[i] = this.buffer[this.readIndex];
      this.readIndex = (this.readIndex + 1) % this.buffer.length;
    }
    this.available -= toRead;
    return toRead;
  }

  public readFrame(frameSize = SAMPLES_PER_FRAME): Float32Array | null {
    if (this.available < frameSize) {
      return null;
    }
    const frame = new Float32Array(frameSize);
    this.read(frame);
    return frame;
  }

  public getAvailableSamples(): number {
    return this.available;
  }

  public clear(): void {
    this.readIndex = 0;
    this.writeIndex = 0;
    this.available = 0;
  }
}

export interface JitterPacket {
  sequence: number;
  timestamp: number;
  samples: Float32Array;
}

/**
 * Audio Jitter Buffer
 * Re-orders packets arriving out-of-order and provides continuous playout
 */
export class AudioJitterBuffer {
  private queue: JitterPacket[] = [];
  private targetDelayMs: number;
  private maxQueueSize: number;

  constructor(targetDelayMs = 60, maxQueueSize = 20) {
    this.targetDelayMs = targetDelayMs;
    this.maxQueueSize = maxQueueSize;
  }

  public push(packet: JitterPacket): void {
    this.queue.push(packet);
    this.queue.sort((a, b) => a.sequence - b.sequence);

    // Drop oldest packets if exceeding maxQueueSize to prevent unbounded memory growth
    if (this.queue.length > this.maxQueueSize) {
      this.queue.shift();
    }
  }

  public pop(): JitterPacket | null {
    if (!this.queue.length) return null;
    return this.queue.shift() ?? null;
  }

  public size(): number {
    return this.queue.length;
  }

  public clear(): void {
    this.queue = [];
  }
}
