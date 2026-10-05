import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { VoiceActivityDetector } from "../src/speech/vad.js";
import { CallLanguageIntelligence } from "../src/speech/language.js";
import { encodeWavBuffer } from "../src/speech/transcription.js";
import { generateSinePcm, CANONICAL_SAMPLE_RATE } from "../src/audio/pcm.js";

describe("ASR, VAD & Language Intelligence", () => {
  test("VoiceActivityDetector transitions through SILENCE -> SPEECH -> SPEECH_END", () => {
    const vad = new VoiceActivityDetector({
      speechStartThreshold: 0.02,
      speechEndThreshold: 0.01,
      minimumSpeechMs: 40,
      silenceTimeoutMs: 60,
    });

    const silentFrame = new Float32Array(320).fill(0);
    const speechFrame = generateSinePcm(300, 20); // loud 20ms sine wave

    // Frame 1: Silence
    const e1 = vad.processFrame(silentFrame);
    assert.equal(e1.type, "silence");

    // Frame 2: Loud (Possible speech, 20ms)
    const e2 = vad.processFrame(speechFrame);
    assert.equal(e2.type, "silence");

    // Frame 3: Loud (Hits 40ms minimum -> Speech Start)
    const e3 = vad.processFrame(speechFrame);
    assert.equal(e3.type, "speech_start");

    // Frame 4: Loud (Speech continuation)
    const e4 = vad.processFrame(speechFrame);
    assert.equal(e4.type, "speech_continuation");

    // Frame 5, 6, 7: Silence (60ms -> Speech End)
    vad.processFrame(silentFrame);
    vad.processFrame(silentFrame);
    const eEnd = vad.processFrame(silentFrame);
    assert.equal(eEnd.type, "speech_end");
  });

  test("CallLanguageIntelligence detects Hindi, Hinglish, and English", () => {
    const hindi = CallLanguageIntelligence.detectLanguage("नमस्ते, आप कैसे हैं?");
    assert.equal(hindi.language, "hi");

    const hinglish = CallLanguageIntelligence.detectLanguage("haan bhai, kya scene hai? help chahiye mujhe");
    assert.equal(hinglish.language, "hi-en");

    const english = CallLanguageIntelligence.detectLanguage("Good morning, could you please schedule a reminder for tomorrow?");
    assert.equal(english.language, "en");
  });

  test("encodeWavBuffer creates a valid 16kHz mono 16-bit PCM WAV header", () => {
    const samples = new Float32Array(1600); // 100ms at 16kHz
    const wav = encodeWavBuffer(samples);

    assert.equal(wav.subarray(0, 4).toString(), "RIFF");
    assert.equal(wav.subarray(8, 12).toString(), "WAVE");
    assert.equal(wav.subarray(12, 16).toString(), "fmt ");
    assert.equal(wav.readUInt16LE(20), 1); // PCM
    assert.equal(wav.readUInt16LE(22), 1); // Mono
    assert.equal(wav.readUInt32LE(24), CANONICAL_SAMPLE_RATE); // 16000
    assert.equal(wav.subarray(36, 40).toString(), "data");
    assert.equal(wav.length, 44 + 1600 * 2); // 44 byte header + 3200 bytes PCM data
  });
});
