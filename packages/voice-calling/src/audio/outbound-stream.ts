import { SAMPLES_PER_FRAME } from "./pcm.js";
import type { WhatsAppCallTransport } from "../transport/transport-interface.js";

export interface OutboundAudioStreamOptions {
  callId: string;
  transport: WhatsAppCallTransport;
  onPlaybackFinished?: () => void;
  onInterrupted?: () => void;
}

/**
 * Outbound Audio Stream
 * Streams synthesized TTS Float32 PCM audio to the caller through the transport.
 * Supports instantaneous cancellation on caller barge-in / interruption.
 */
export class OutboundAudioStream {
  private callId: string;
  private transport: WhatsAppCallTransport;
  private queue: Float32Array[] = [];
  private isPlaying = false;
  private isAborted = false;
  private onPlaybackFinished?: () => void;
  private onInterrupted?: () => void;

  constructor(options: OutboundAudioStreamOptions) {
    this.callId = options.callId;
    this.transport = options.transport;
    this.onPlaybackFinished = options.onPlaybackFinished;
    this.onInterrupted = options.onInterrupted;
  }

  /**
   * Appends synthesized PCM samples to the playout queue
   */
  public enqueue(samples: Float32Array): void {
    if (this.isAborted || !samples.length) return;

    // Slice into 20ms frames for smooth continuous delivery
    for (let offset = 0; offset < samples.length; offset += SAMPLES_PER_FRAME) {
      const frame = samples.slice(offset, Math.min(offset + SAMPLES_PER_FRAME, samples.length));
      this.queue.push(frame);
    }

    if (!this.isPlaying) {
      void this.playNext();
    }
  }

  private async playNext(): Promise<void> {
    if (this.isAborted) {
      this.isPlaying = false;
      return;
    }

    if (!this.queue.length) {
      this.isPlaying = false;
      if (this.onPlaybackFinished) {
        this.onPlaybackFinished();
      }
      return;
    }

    this.isPlaying = true;
    const frame = this.queue.shift();
    if (frame) {
      try {
        await this.transport.sendAudio(this.callId, frame);
      } catch (err) {
        console.warn(`[OutboundAudioStream] sendAudio failed on call ${this.callId}:`, err);
      }
    }

    // Schedule next frame with 20ms cadence
    setTimeout(() => {
      void this.playNext();
    }, 18);
  }

  /**
   * CRITICAL REQUIREMENT 18: Barge-in / Interruption
   * Instantly stops outbound audio, drains queue, and halts playback immediately.
   */
  public abort(): void {
    this.isAborted = true;
    this.isPlaying = false;
    this.queue = [];
    if (this.onInterrupted) {
      this.onInterrupted();
    }
  }

  public isActive(): boolean {
    return this.isPlaying || this.queue.length > 0;
  }

  public reset(): void {
    this.isAborted = false;
    this.isPlaying = false;
    this.queue = [];
  }
}
