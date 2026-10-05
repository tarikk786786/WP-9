import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { CallCleanupManager } from "../src/recovery/cleanup.js";
import { CallDisconnectWatcher } from "../src/recovery/reconnect.js";
import { CallResponseEngine } from "../src/intelligence/response.js";

describe("Failure Modes & Recovery", () => {
  test("CallCleanupManager disposes all resources cleanly on call termination", async () => {
    const cleanup = new CallCleanupManager();
    let r1Disposed = false;
    let r2Disposed = false;

    cleanup.register({
      name: "resource1",
      dispose: () => {
        r1Disposed = true;
      },
    });

    cleanup.register({
      name: "resource2",
      dispose: () => {
        r2Disposed = true;
      },
    });

    assert.equal(cleanup.isDone(), false);
    await cleanup.cleanup();
    assert.equal(cleanup.isDone(), true);
    assert.equal(r1Disposed, true);
    assert.equal(r2Disposed, true);
  });

  test("CallDisconnectWatcher cancels timeout if connection is restored before grace period", async () => {
    let timeoutFired = false;
    const watcher = new CallDisconnectWatcher(50, () => {
      timeoutFired = true;
    });

    // Connection drops
    watcher.onTransportInterrupted();

    // Connection restored quickly after 10ms
    await new Promise((r) => setTimeout(r, 10));
    watcher.onTransportRestored();

    // Wait until grace period passes
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(timeoutFired, false);
  });

  test("CallDisconnectWatcher fires timeout if connection is not restored", async () => {
    let timeoutFired = false;
    const watcher = new CallDisconnectWatcher(30, () => {
      timeoutFired = true;
    });

    watcher.onTransportInterrupted();
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(timeoutFired, true);
  });

  test("CallResponseEngine returns polite spoken fallback when models are unavailable", async () => {
    const engine = new CallResponseEngine();
    // No API keys set in test environment -> falls back to deterministic polite phrase
    const res = await engine.generateResponse({
      callId: "test_fallback",
      callerPhone: "+911234567890",
      turns: [],
      currentUtterance: "random query without keys",
      detectedLanguage: "hi",
      languageConfidence: 0.9,
    });

    assert.ok(res.text.includes("Ji, main sun raha hoon"));
  });
});
