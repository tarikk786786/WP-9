import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { HindiSpeechFormatter } from "../src/tts/hindi.js";
import { SyntheticVoiceProvider, FallbackVoiceProvider } from "../src/tts/tts-providers.js";
import { computeRmsEnergy } from "../src/audio/pcm.js";

describe("TTS Streaming & Hindi Voice Formatting", () => {
  test("HindiSpeechFormatter cleans markdown, emojis, URLs for spoken output", () => {
    const raw = "Namaste! Check **https://example.com/item** here 😊 *bhai*!";
    const cleaned = HindiSpeechFormatter.prepareForVoice(raw);

    assert.ok(!cleaned.includes("**"));
    assert.ok(!cleaned.includes("*"));
    assert.ok(!cleaned.includes("https://"));
    assert.ok(!cleaned.includes("😊"));
    assert.ok(cleaned.includes("link"));
  });

  test("SyntheticVoiceProvider streams non-empty 16kHz PCM audio chunks", async () => {
    const provider = new SyntheticVoiceProvider();
    const isAvail = await provider.isAvailable();
    assert.equal(isAvail, true);

    const chunks: Float32Array[] = [];
    for await (const chunk of provider.synthesizeStream("Hello! This is a test voice stream.")) {
      chunks.push(chunk);
      assert.ok(chunk.length > 0);
    }

    assert.ok(chunks.length > 0);
    const totalSamples = chunks.reduce((acc, c) => acc + c.length, 0);
    const merged = new Float32Array(totalSamples);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.length;
    }
    const energy = computeRmsEnergy(merged);
    assert.ok(energy > 0.05);
  });

  test("FallbackVoiceProvider automatically falls back if primary fails", async () => {
    const failingPrimary = {
      name: "failing_primary",
      async *synthesizeStream() {
        throw new Error("API rate limit exceeded");
      },
      async synthesize() {
        throw new Error("API rate limit exceeded");
      },
      async isAvailable() {
        return false;
      },
    };

    const syntheticSecondary = new SyntheticVoiceProvider();
    const fallback = new FallbackVoiceProvider(failingPrimary, syntheticSecondary);

    const pcm = await fallback.synthesize("Fallback test text");
    assert.ok(pcm.length > 0);
  });
});
