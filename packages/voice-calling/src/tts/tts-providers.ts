import { CANONICAL_SAMPLE_RATE, int16ToFloat32 } from "../audio/pcm.js";
import { HindiSpeechFormatter } from "./hindi.js";
import type { VoiceProvider } from "./provider.js";
import type { VoiceOptions } from "../types.js";

/**
 * Deterministic Synthetic Voice Provider
 * Emits valid 16 kHz Float32 PCM audio with harmonic speech-like modulation.
 * Guarantees 100% reliable offline testing and unit tests without external API calls.
 */
export class SyntheticVoiceProvider implements VoiceProvider {
  public name = "SyntheticVoice";

  public async isAvailable(): Promise<boolean> {
    return true;
  }

  public async synthesize(text: string, _options?: VoiceOptions): Promise<Float32Array> {
    const formatted = HindiSpeechFormatter.formatForSpeech(text);
    // Approximate speech duration: ~15 characters per second (minimum 300ms)
    const durationSeconds = Math.max(0.3, formatted.length / 14);
    const sampleCount = Math.round(CANONICAL_SAMPLE_RATE * durationSeconds);
    const pcm = new Float32Array(sampleCount);

    // Formant-like harmonic tone
    for (let i = 0; i < sampleCount; i++) {
      const t = i / CANONICAL_SAMPLE_RATE;
      // Speech modulation between 180 Hz and 240 Hz with envelope decay
      const envelope = Math.sin((Math.PI * i) / sampleCount);
      pcm[i] =
        0.3 * Math.sin(2 * Math.PI * 220 * t) * envelope +
        0.15 * Math.sin(2 * Math.PI * 440 * t) * envelope;
    }

    return pcm;
  }

  public async *synthesizeStream(text: string, options?: VoiceOptions): AsyncIterable<Float32Array> {
    const full = await this.synthesize(text, options);
    const chunkSize = 320 * 4; // 80ms chunks

    for (let offset = 0; offset < full.length; offset += chunkSize) {
      yield full.slice(offset, Math.min(offset + chunkSize, full.length));
    }
  }
}

/**
 * OpenAI Speech Provider (tts-1)
 * High-quality Hindi & English speech synthesis.
 */
export class OpenAiVoiceProvider implements VoiceProvider {
  public name = "OpenAiVoice";
  private apiKey?: string;

  constructor(apiKey = process.env.OPENAI_API_KEY) {
    this.apiKey = apiKey;
  }

  public async isAvailable(): Promise<boolean> {
    return Boolean(this.apiKey || process.env.OPENAI_API_KEY);
  }

  public async synthesize(text: string, options?: VoiceOptions): Promise<Float32Array> {
    const key = this.apiKey || process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error("[OpenAiVoiceProvider] OPENAI_API_KEY not configured");
    }

    const clean = HindiSpeechFormatter.formatForSpeech(text);
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        voice: options?.voice || "alloy",
        input: clean,
        response_format: "pcm", // 24kHz raw 16-bit PCM
        speed: options?.speed || 1.0,
      }),
      signal: AbortSignal.timeout(options?.timeoutMs || 8_000),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI TTS error ${response.status}: ${errText}`);
    }

    const arrayBuf = await response.arrayBuffer();
    // OpenAI pcm response format is 24kHz 16-bit LE PCM
    // We convert Int16 to Float32, then resample from 24kHz to canonical 16kHz
    const rawFloat32 = int16ToFloat32(new Int16Array(arrayBuf));
    const { AudioResampler } = await import("../audio/resampler.js");
    return AudioResampler.resample(rawFloat32, 24_000, CANONICAL_SAMPLE_RATE);
  }

  public async *synthesizeStream(text: string, options?: VoiceOptions): AsyncIterable<Float32Array> {
    // Non-blocking synthesis returning chunked Float32Array frames
    const full = await this.synthesize(text, options);
    const chunkSize = 320 * 4; // 80ms chunks
    for (let offset = 0; offset < full.length; offset += chunkSize) {
      yield full.slice(offset, Math.min(offset + chunkSize, full.length));
    }
  }
}

/**
 * Fallback Composite Voice Provider
 * Tries primary provider first; falls back to secondary on timeout or error.
 */
export class FallbackVoiceProvider implements VoiceProvider {
  public name = "CompositeVoiceProvider";
  private primary: VoiceProvider;
  private fallback: VoiceProvider;

  constructor(primary?: VoiceProvider, fallback?: VoiceProvider) {
    this.primary = primary || new OpenAiVoiceProvider();
    this.fallback = fallback || new SyntheticVoiceProvider();
  }

  public async isAvailable(): Promise<boolean> {
    return (await this.primary.isAvailable()) || (await this.fallback.isAvailable());
  }

  public async synthesize(text: string, options?: VoiceOptions): Promise<Float32Array> {
    if (await this.primary.isAvailable()) {
      try {
        return await this.primary.synthesize(text, options);
      } catch (err) {
        console.warn(`[FallbackVoiceProvider] Primary TTS (${this.primary.name}) failed, falling back:`, err);
      }
    }
    return this.fallback.synthesize(text, options);
  }

  public async *synthesizeStream(text: string, options?: VoiceOptions): AsyncIterable<Float32Array> {
    if (await this.primary.isAvailable()) {
      try {
        for await (const chunk of this.primary.synthesizeStream(text, options)) {
          yield chunk;
        }
        return;
      } catch (err) {
        console.warn(`[FallbackVoiceProvider] Primary stream failed, using fallback:`, err);
      }
    }

    for await (const chunk of this.fallback.synthesizeStream(text, options)) {
      yield chunk;
    }
  }
}
