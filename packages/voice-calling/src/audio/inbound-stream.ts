import { AudioRingBuffer } from "./buffer.js";
import { AudioResampler } from "./resampler.js";
import { CANONICAL_SAMPLE_RATE, SAMPLES_PER_FRAME } from "./pcm.js";

export interface InboundAudioStreamOptions {
  inputSampleRate?: number;
  onFrame?: (frame: Float32Array) => void;
}

/**
 * Inbound Audio Stream
 * Receives remote audio from the transport, normalizes to 16 kHz Float32 PCM,
 * and emits uniform 20 ms frames for VAD & speech detection.
 */
export class InboundAudioStream {
  private ringBuffer: AudioRingBuffer;
  private inputSampleRate: number;
  private onFrame?: (frame: Float32Array) => void;
  private isClosed = false;

  constructor(options: InboundAudioStreamOptions = {}) {
    this.inputSampleRate = options.inputSampleRate || CANONICAL_SAMPLE_RATE;
    this.onFrame = options.onFrame;
    this.ringBuffer = new AudioRingBuffer(16_000 * 10); // 10s buffer
  }

  public push(samples: Float32Array): void {
    if (this.isClosed) return;

    // Resample to canonical 16kHz if needed
    const canonical = this.inputSampleRate !== CANONICAL_SAMPLE_RATE
      ? AudioResampler.normalizeToCanonical(samples, this.inputSampleRate)
      : samples;

    this.ringBuffer.write(canonical);

    // Drain available 20ms frames
    while (this.ringBuffer.getAvailableSamples() >= SAMPLES_PER_FRAME) {
      const frame = this.ringBuffer.readFrame(SAMPLES_PER_FRAME);
      if (frame && this.onFrame) {
        this.onFrame(frame);
      }
    }
  }

  public setFrameHandler(handler: (frame: Float32Array) => void): void {
    this.onFrame = handler;
  }

  public clear(): void {
    this.ringBuffer.clear();
  }

  public close(): void {
    this.isClosed = true;
    this.clear();
  }
}
