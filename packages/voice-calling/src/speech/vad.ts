import { computeRmsEnergy, FRAME_DURATION_MS } from "../audio/pcm.js";

export interface VadConfig {
  speechStartThreshold?: number; // RMS threshold to trigger speech (default 0.025)
  speechEndThreshold?: number;   // RMS threshold below which is silence (default 0.015)
  minimumSpeechMs?: number;      // Minimum continuous speech duration to trigger SPEECH_START (default 140ms)
  maximumUtteranceMs?: number;   // Max continuous speech before forcing endpoint (default 15000ms)
  silenceTimeoutMs?: number;     // Silence duration to declare speech complete (default 500ms)
}

export type VadState = "SILENCE" | "POSSIBLE_SPEECH" | "SPEECH" | "POSSIBLE_SILENCE";

export interface VadEvent {
  type: "speech_start" | "speech_continuation" | "speech_end" | "silence";
  energy: number;
  durationMs: number;
}

/**
 * Voice Activity Detection (VAD) Engine
 * Operates on 20 ms frames of canonical 16 kHz Float32 PCM.
 * Accurately detects utterance boundaries and prevents false triggers from background noise.
 */
export class VoiceActivityDetector {
  private config: Required<VadConfig>;
  private state: VadState = "SILENCE";
  private consecutiveSpeechMs = 0;
  private consecutiveSilenceMs = 0;
  private totalUtteranceMs = 0;

  constructor(config: VadConfig = {}) {
    this.config = {
      speechStartThreshold: config.speechStartThreshold ?? 0.025,
      speechEndThreshold: config.speechEndThreshold ?? 0.015,
      minimumSpeechMs: config.minimumSpeechMs ?? 140,
      maximumUtteranceMs: config.maximumUtteranceMs ?? 15_000,
      silenceTimeoutMs: config.silenceTimeoutMs ?? 500,
    };
  }

  public processFrame(frame: Float32Array): VadEvent {
    const energy = computeRmsEnergy(frame);
    const isLoud = energy >= this.config.speechStartThreshold;
    const isQuiet = energy < this.config.speechEndThreshold;

    switch (this.state) {
      case "SILENCE": {
        if (isLoud) {
          this.state = "POSSIBLE_SPEECH";
          this.consecutiveSpeechMs = FRAME_DURATION_MS;
          this.consecutiveSilenceMs = 0;
        } else {
          this.consecutiveSilenceMs += FRAME_DURATION_MS;
        }
        return { type: "silence", energy, durationMs: this.consecutiveSilenceMs };
      }

      case "POSSIBLE_SPEECH": {
        if (isLoud) {
          this.consecutiveSpeechMs += FRAME_DURATION_MS;
          if (this.consecutiveSpeechMs >= this.config.minimumSpeechMs) {
            this.state = "SPEECH";
            this.totalUtteranceMs = this.consecutiveSpeechMs;
            return { type: "speech_start", energy, durationMs: this.totalUtteranceMs };
          }
        } else {
          // False positive glitch (door click, static) -> return to silence
          this.state = "SILENCE";
          this.consecutiveSpeechMs = 0;
          this.consecutiveSilenceMs = FRAME_DURATION_MS;
          return { type: "silence", energy, durationMs: this.consecutiveSilenceMs };
        }
        return { type: "silence", energy, durationMs: 0 };
      }

      case "SPEECH": {
        this.totalUtteranceMs += FRAME_DURATION_MS;

        // Force speech end if exceeding maximum utterance limit
        if (this.totalUtteranceMs >= this.config.maximumUtteranceMs) {
          this.state = "SILENCE";
          const finalDuration = this.totalUtteranceMs;
          this.reset();
          return { type: "speech_end", energy, durationMs: finalDuration };
        }

        if (isQuiet) {
          this.state = "POSSIBLE_SILENCE";
          this.consecutiveSilenceMs = FRAME_DURATION_MS;
          return { type: "speech_continuation", energy, durationMs: this.totalUtteranceMs };
        }

        this.consecutiveSilenceMs = 0;
        return { type: "speech_continuation", energy, durationMs: this.totalUtteranceMs };
      }

      case "POSSIBLE_SILENCE": {
        this.totalUtteranceMs += FRAME_DURATION_MS;

        if (isLoud) {
          // Caller continued speaking after a micro-pause
          this.state = "SPEECH";
          this.consecutiveSilenceMs = 0;
          return { type: "speech_continuation", energy, durationMs: this.totalUtteranceMs };
        }

        this.consecutiveSilenceMs += FRAME_DURATION_MS;
        if (this.consecutiveSilenceMs >= this.config.silenceTimeoutMs) {
          // Utterance definitively ended
          this.state = "SILENCE";
          const finalDuration = this.totalUtteranceMs - this.consecutiveSilenceMs;
          this.reset();
          return { type: "speech_end", energy, durationMs: Math.max(0, finalDuration) };
        }

        return { type: "speech_continuation", energy, durationMs: this.totalUtteranceMs };
      }
    }
  }

  public isSpeaking(): boolean {
    return this.state === "SPEECH" || this.state === "POSSIBLE_SILENCE";
  }

  public reset(): void {
    this.state = "SILENCE";
    this.consecutiveSpeechMs = 0;
    this.consecutiveSilenceMs = 0;
    this.totalUtteranceMs = 0;
  }
}
