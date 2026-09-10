import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultBotSettings, type NormalizedMessage } from "@bot/shared";
import { routeMessage } from "./router.ts";

function createDummyMessage(text = "hello"): NormalizedMessage {
  return {
    id: "msg_123",
    whatsappMessageId: "wamid_123",
    sender: "919114411026@s.whatsapp.net",
    chatId: "919114411026@s.whatsapp.net",
    fromName: "Test User",
    type: "text",
    text,
    timestamp: new Date().toISOString(),
    isGroup: false,
    metadata: {},
  };
}

describe("Authoritative Human Handoff & Safe Bot Controls", () => {
  it("skips replying when conversation status is waiting_human", () => {
    const decision = routeMessage({
      message: createDummyMessage("kal free ho?"),
      settings: defaultBotSettings(),
      rules: [],
      faqs: [],
      conversationStatus: "waiting_human",
    });
    assert.equal(decision.action, "skip");
    assert.equal(decision.intent, "status_waiting_human");
  });

  it("skips replying when conversation status is human", () => {
    const decision = routeMessage({
      message: createDummyMessage("urgent help please"),
      settings: defaultBotSettings(),
      rules: [],
      faqs: [],
      conversationStatus: "human",
    });
    assert.equal(decision.action, "skip");
    assert.equal(decision.intent, "status_human");
  });

  it("skips replying when conversation status is paused", () => {
    const decision = routeMessage({
      message: createDummyMessage("bhai kal milte"),
      settings: defaultBotSettings(),
      rules: [],
      faqs: [],
      conversationStatus: "paused",
    });
    assert.equal(decision.action, "skip");
    assert.equal(decision.intent, "status_paused");
  });

  it("skips replying when conversation status is closed", () => {
    const decision = routeMessage({
      message: createDummyMessage("thanks"),
      settings: defaultBotSettings(),
      rules: [],
      faqs: [],
      conversationStatus: "closed",
    });
    assert.equal(decision.action, "skip");
    assert.equal(decision.intent, "status_closed");
  });

  it("allows replying when conversation status is bot", () => {
    const decision = routeMessage({
      message: createDummyMessage("kal free ho kya"),
      settings: defaultBotSettings(),
      rules: [],
      faqs: [],
      conversationStatus: "bot",
    });
    assert.equal(decision.action, "reply");
  });

  it("strictly skips replying when bot is disabled in settings", () => {
    const disabledSettings = { ...defaultBotSettings(), enabled: false };
    const decision = routeMessage({
      message: createDummyMessage("hello"),
      settings: disabledSettings,
      rules: [],
      faqs: [],
      conversationStatus: "bot",
    });
    assert.equal(decision.action, "skip");
    assert.equal(decision.intent, "disabled");
  });
});
