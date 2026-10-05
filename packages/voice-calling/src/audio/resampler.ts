import { CANONICAL_SAMPLE_RATE } from "./pcm.js";

/**
 * High-quality linear interpolating audio resampler
 */
export class AudioResampler {
  /**
   * Resamples Float32Array PCM from fromRate to toRate
   */
  public static resample(
    samples: Float32Array,
    fromRate: number,
    toRate: number
  ): Float32Array {
    if (fromRate === toRate || !samples.length) {
      return samples;
    }

    const ratio = fromRate / toRate;
    const newLength = Math.round(samples.length / ratio);
    const result = new Float32Array(newLength);

    for (let i = 0; i < newLength; i++) {
      const srcIndex = i * ratio;
      const indexFloor = Math.floor(srcIndex);
      const indexCeil = Math.min(indexFloor + 1, samples.length - 1);
      const fraction = srcIndex - indexFloor;

      result[i] = samples[indexFloor] * (1 - fraction) + samples[indexCeil] * fraction;
    }

    return result;
  }

  /**
   * Normalizes any input audio buffer to 16 kHz Float32 PCM
   */
  public static normalizeToCanonical(
    samples: Float32Array,
    inputSampleRate: number
  ): Float32Array {
    return this.resample(samples, inputSampleRate, CANONICAL_SAMPLE_RATE);
  }

  /**
   * Resamples canonical 16 kHz audio to target device/transport rate
   */
  public static fromCanonical(
    samples: Float32Array,
    targetSampleRate: number
  ): Float32Array {
    return this.resample(samples, CANONICAL_SAMPLE_RATE, targetSampleRate);
  }
}
