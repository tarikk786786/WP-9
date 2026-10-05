import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { MockCallTransport } from "../src/transport/mock-call-transport.js";
import { VoiceCallManager } from "../src/call-manager.js";
import { SyntheticVoiceProvider } from "../src/tts/tts-providers.js";
import { generateSinePcm } from "../src/audio/pcm.js";

describe("End-to-End Inbound Call Flow with Mock Transport", () => {
  test("Inbound call is answered, processed, and logged", async () => {
    const transport = new MockCallTransport();
    await transport.initialize();

    const ttsProvider = new SyntheticVoiceProvider();

    // Mock ASR engine that returns deterministic text for testing
    const mockAsr = {
      transcribe: async () => ({
        transcript: "hello bhai",
        normalizedText: "hello bhai",
        language: "hi-en" as const,
        confidence: 0.95,
        durationMs: 500,
        latencyMs: 10,
      }),
    };

    // Mock Response engine
    const mockResponseEngine = {
      generateResponse: async () => ({
        text: "Haan bolo bhai, sab theek hai.",
        latencyMs: 15,
      }),
    };

    const callManager = new VoiceCallManager({
      transport,
      asrEngine: mockAsr as any,
      ttsProvider,
      responseEngine: mockResponseEngine as any,
      policy: {
        autoAnswerEnabled: true,
        aiDisclosure: "", // Empty for test brevity
        silenceTimeoutMs: 10_000,
      },
    });

    let callStarted = false;
    let callEnded = false;

    callManager.on("callStarted", () => {
      callStarted = true;
    });

    callManager.on("callEnded", () => {
      callEnded = true;
    });

    // Simulate incoming call and wait for answer & session start
    await transport.simulateIncomingCall({
      callId: "test_call_101",
      callerJid: "919876543210@s.whatsapp.net",
      callerPhone: "+919876543210",
      timestamp: Date.now(),
      isGroup: false,
    });

    assert.equal(callStarted, true);
    assert.equal(callManager.getActiveSessions().length, 1);

    // Simulate caller sending speech: 10 frames = 200ms (> 140ms minimumSpeechMs)
    const speechFrame = generateSinePcm(350, 20);
    const silentFrame = new Float32Array(320).fill(0);

    for (let i = 0; i < 10; i++) {
      transport.simulateRemoteAudio("test_call_101", speechFrame);
    }

    // Followed by silence to trigger endpointing: 30 frames = 600ms (> 500ms silenceTimeoutMs)
    for (let i = 0; i < 30; i++) {
      transport.simulateRemoteAudio("test_call_101", silentFrame);
    }

    // Wait for turn processing and bot audio delivery
    await new Promise((resolve) => setTimeout(resolve, 250));

    // Bot should have generated outbound audio
    const sent = transport.getSentAudio("test_call_101");
    assert.ok(sent.length > 0);

    // End the call
    await callManager.hangupCall("test_call_101");
    assert.equal(callEnded, true);
    assert.equal(callManager.getActiveSessions().length, 0);

    // Audit log should be populated
    const logs = callManager.getAuditLogger().getRecentLogs();
    assert.equal(logs.length, 1);
    assert.equal(logs[0].callId, "test_call_101");

    await callManager.destroy();
  });
});
