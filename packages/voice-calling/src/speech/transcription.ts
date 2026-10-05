import { transcribeAudio } from "@bot/engine";
import { float32ToInt16Buffer, CANONICAL_SAMPLE_RATE } from "../audio/pcm.js";
import { CallLanguageIntelligence, type DetectedLanguage } from "./language.js";

export interface TranscriptionResult {
  transcript: string;
  normalizedText: string;
  language: DetectedLanguage;
  confidence: number;
  durationMs: number;
  latencyMs: number;
}

/**
 * Encodes Float32Array PCM samples into a minimal canonical 16kHz mono WAV buffer
 */
export function encodeWavBuffer(samples: Float32Array, sampleRate = CANONICAL_SAMPLE_RATE): Buffer {
  const pcmBytes = float32ToInt16Buffer(samples);
  const wavHeader = Buffer.alloc(44);

  // RIFF identifier
  wavHeader.write("RIFF", 0);
  wavHeader.writeUInt32LE(36 + pcmBytes.length, 4);
  wavHeader.write("WAVE", 8);

  // format chunk identifier
  wavHeader.write("fmt ", 12);
  wavHeader.writeUInt32LE(16, 16); // format chunk length
  wavHeader.writeUInt16LE(1, 20);  // sample format (1 = PCM)
  wavHeader.writeUInt16LE(1, 22);  // channel count (1 = mono)
  wavHeader.writeUInt32LE(sampleRate, 24); // sample rate
  wavHeader.writeUInt32LE(sampleRate * 2, 28); // byte rate (sampleRate * channels * bytesPerSample)
  wavHeader.writeUInt16LE(2, 32);  // block align (channels * bytesPerSample)
  wavHeader.writeUInt16LE(16, 34); // bits per sample

  // data chunk identifier
  wavHeader.write("data", 36);
  wavHeader.writeUInt32LE(pcmBytes.length, 40);

  return Buffer.concat([wavHeader, pcmBytes]);
}

/**
 * Reusable Voice Call ASR Transcriber
 * Reuses existing WP-9 Groq whisper-large-v3-turbo / OpenAI Whisper models.
 */
export class CallTranscriptionEngine {
  public async transcribe(samples: Float32Array): Promise<TranscriptionResult> {
    const start = Date.now();
    const durationMs = Math.round((samples.length / CANONICAL_SAMPLE_RATE) * 1000);

    if (samples.length < CANONICAL_SAMPLE_RATE * 0.15) {
      // Under 150ms of audio -> too short for reliable ASR
      return {
        transcript: "",
        normalizedText: "",
        language: "unknown",
        confidence: 0,
        durationMs,
        latencyMs: Date.now() - start,
      };
    }

    try {
      const wavBuffer = encodeWavBuffer(samples);
      const rawTranscript = await transcribeAudio(wavBuffer, "audio/wav");

      const latencyMs = Date.now() - start;
      const langResult = CallLanguageIntelligence.detectLanguage(rawTranscript);

      return {
        transcript: rawTranscript,
        normalizedText: langResult.normalizedText,
        language: langResult.language,
        confidence: langResult.confidence,
        durationMs,
        latencyMs,
      };
    } catch (err) {
      console.warn("[CallTranscriptionEngine] ASR failed:", err);
      return {
        transcript: "",
        normalizedText: "",
        language: "unknown",
        confidence: 0,
        durationMs,
        latencyMs: Date.now() - start,
      };
    }
  }
}
