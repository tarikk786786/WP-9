import type { VoiceOptions } from "../types.js";

/**
 * Streaming Voice Provider Abstraction
 * Generates canonical 16 kHz Float32 PCM audio chunks in real-time.
 */
export interface VoiceProvider {
  name: string;

  /**
   * Synthesizes text into streaming 16kHz Float32 PCM chunks
   */
  synthesizeStream(
    text: string,
    options?: VoiceOptions
  ): AsyncIterable<Float32Array>;

  /**
   * Quick non-streaming synthesis for short utterances
   */
  synthesize(
    text: string,
    options?: VoiceOptions
  ): Promise<Float32Array>;

  isAvailable(): Promise<boolean>;
}
