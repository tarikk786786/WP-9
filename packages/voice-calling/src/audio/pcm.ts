/**
 * Canonical 16 kHz Mono Float32 PCM Audio Utilities
 *
 * In WP-9, all speech, VAD, ASR, and TTS processing operates strictly
 * on 16 kHz mono Float32Array where sample values are normalized in [-1.0, 1.0].
 */

export const CANONICAL_SAMPLE_RATE = 16_000;
export const CANONICAL_CHANNELS = 1;
export const FRAME_DURATION_MS = 20; // 20 ms standard frame
export const SAMPLES_PER_FRAME = (CANONICAL_SAMPLE_RATE * FRAME_DURATION_MS) / 1000; // 320 samples

/**
 * Converts 16-bit signed integer PCM (Int16Array / Buffer) to Float32Array [-1.0, 1.0]
 */
export function int16ToFloat32(input: Int16Array | Buffer): Float32Array {
  const int16 = input instanceof Buffer
    ? new Int16Array(input.buffer, input.byteOffset, input.byteLength / 2)
    : input;
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    const s = int16[i];
    float32[i] = s < 0 ? s / 0x8000 : s / 0x7fff;
  }
  return float32;
}

/**
 * Converts Float32Array [-1.0, 1.0] to 16-bit signed integer PCM Buffer
 */
export function float32ToInt16Buffer(input: Float32Array): Buffer {
  const buf = Buffer.alloc(input.length * 2);
  for (let i = 0; i < input.length; i++) {
    // Soft clamp between -1.0 and 1.0
    const sample = Math.max(-1.0, Math.min(1.0, input[i]));
    const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    buf.writeInt16LE(Math.round(int16), i * 2);
  }
  return buf;
}

/**
 * Computes Root Mean Square (RMS) energy of Float32 PCM frame
 */
export function computeRmsEnergy(samples: Float32Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}

/**
 * Computes Decibels relative to Full Scale (dBFS)
 */
export function computeDbfs(samples: Float32Array): number {
  const rms = computeRmsEnergy(samples);
  if (rms <= 0.00001) return -100;
  return 20 * Math.log10(rms);
}

/**
 * Checks if a frame consists only of digital silence or background noise
 */
export function isSilence(samples: Float32Array, thresholdRms = 0.012): boolean {
  return computeRmsEnergy(samples) < thresholdRms;
}

/**
 * Generates synthetic silence frame of specified duration
 */
export function generateSilence(sampleRate = CANONICAL_SAMPLE_RATE, durationMs = 20): Float32Array {
  const count = Math.round((sampleRate * durationMs) / 1000);
  return new Float32Array(count);
}

/**
 * Converts Float32Array [-1.0, 1.0] to Int16Array
 */
export function float32ToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const sample = Math.max(-1.0, Math.min(1.0, input[i]));
    out[i] = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
  }
  return out;
}

/**
 * Generates synthetic sine wave test tone (e.g. for testing audio pipelines)
 */
export function generateSineTone(
  frequencyHz: number,
  durationMs: number,
  amplitude = 0.5,
  sampleRate = CANONICAL_SAMPLE_RATE
): Float32Array {
  const count = Math.round((sampleRate * durationMs) / 1000);
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const t = i / sampleRate;
    out[i] = amplitude * Math.sin(2 * Math.PI * frequencyHz * t);
  }
  return out;
}

export const generateSinePcm = generateSineTone;
