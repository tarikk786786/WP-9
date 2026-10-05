import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  int16ToFloat32,
  float32ToInt16,
  generateSinePcm,
  computeRmsEnergy,
  SAMPLES_PER_FRAME,
} from "../src/audio/pcm.js";
import { AudioResampler } from "../src/audio/resampler.js";
import { AudioRingBuffer, AudioJitterBuffer } from "../src/audio/buffer.js";

describe("Audio Pipeline & PCM Processing", () => {
  test("PCM roundtrip conversion (Float32 <-> Int16)", () => {
    const original = new Float32Array([0, 0.5, -0.5, 0.99, -0.99]);
    const int16 = float32ToInt16(original);
    const roundtrip = int16ToFloat32(int16);

    for (let i = 0; i < original.length; i++) {
      assert.ok(Math.abs(original[i] - roundtrip[i]) < 0.001);
    }
  });

  test("generateSinePcm produces 16kHz sine wave within [-1, 1]", () => {
    const sine = generateSinePcm(440, 20, 1.0); // 20ms of 440Hz at full amplitude 1.0
    assert.equal(sine.length, SAMPLES_PER_FRAME); // 320 samples for 20ms at 16kHz
    const energy = computeRmsEnergy(sine);
    assert.ok(energy > 0.6 && energy < 0.8); // RMS of full sine is ~0.707
  });

  test("AudioResampler resamples 8kHz and 48kHz to 16kHz canonical", () => {
    const original8k = new Float32Array(80); // 10ms at 8kHz
    for (let i = 0; i < original8k.length; i++) original8k[i] = 0.5;

    const resampled16k = AudioResampler.resample(original8k, 8000, 16000);
    assert.equal(resampled16k.length, 160); // 10ms at 16kHz

    const original48k = new Float32Array(480); // 10ms at 48kHz
    const downsampled16k = AudioResampler.resample(original48k, 48000, 16000);
    assert.equal(downsampled16k.length, 160);
  });

  test("AudioRingBuffer writes and reads frame slices cleanly", () => {
    const ringBuffer = new AudioRingBuffer(1000);
    const chunk = new Float32Array(320).fill(0.5);

    ringBuffer.write(chunk);
    assert.equal(ringBuffer.getAvailableSamples(), 320);

    const frame = ringBuffer.readFrame(320);
    assert.ok(frame !== null);
    assert.equal(frame.length, 320);
    assert.equal(frame[0], 0.5);
    assert.equal(ringBuffer.getAvailableSamples(), 0);
  });

  test("AudioJitterBuffer orders packets by sequence number and avoids jitter", () => {
    const jitter = new AudioJitterBuffer(60, 20);
    const f1 = new Float32Array(320).fill(1);
    const f2 = new Float32Array(320).fill(2);
    const f3 = new Float32Array(320).fill(3);

    // Push out of order
    jitter.push({ sequence: 2, timestamp: 20, samples: f2 });
    jitter.push({ sequence: 1, timestamp: 0, samples: f1 });
    jitter.push({ sequence: 3, timestamp: 40, samples: f3 });

    assert.equal(jitter.size(), 3);
    const p1 = jitter.pop();
    const p2 = jitter.pop();
    const p3 = jitter.pop();

    assert.ok(p1 && p1.samples[0] === 1);
    assert.ok(p2 && p2.samples[0] === 2);
    assert.ok(p3 && p3.samples[0] === 3);
  });
});
