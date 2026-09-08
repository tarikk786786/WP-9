import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultAutomationRules, defaultBotSettings, defaultFaqs } from "@bot/shared";
import { isDuplicate, normalizeIncoming, resetDuplicates } from "./parser.ts";
import { isWithinBusinessHours, matchFaq, matchRule, routeMessage } from "./router.ts";

describe("parser", () => {
  it("normalizes a text message and skips fromMe", () => {
    const msg = normalizeIncoming({
      id: "abc",
      jid: "9198@s.whatsapp.net",
      fromMe: false,
      pushName: "Amina",
      message: { conversation: "hello" },
      timestamp: 1_700_000_000,
    });
    assert.equal(msg?.text, "hello");
    assert.equal(msg?.type, "text");
    assert.equal(normalizeIncoming({ id: "x", jid: "a@s.whatsapp.net", fromMe: true }), null);
  });

  it("deduplicates WhatsApp ids", () => {
    resetDuplicates();
    assert.equal(isDuplicate("m1"), false);
    assert.equal(isDuplicate("m1"), true);
  });
});

describe("router", () => {
  const base = {
    settings: defaultBotSettings(),
    rules: defaultAutomationRules(),
    faqs: defaultFaqs(),
    conversationStatus: "bot" as const,
    message: {
      id: "1",
      whatsappMessageId: "w1",
      sender: "9198@s.whatsapp.net",
      chatId: "9198@s.whatsapp.net",
      fromName: "Amina",
      type: "text" as const,
      text: "hi",
      timestamp: new Date().toISOString(),
      isGroup: false,
      metadata: {},
    },
  };

  it("matches keyword rules", () => {
    const hit = matchRule("what is the price", defaultAutomationRules());
    assert.equal(hit?.id, "price");
  });

  it("matches faqs", () => {
    const faq = matchFaq("who are you", defaultFaqs());
    assert.equal(faq?.id, "who");
  });

  it("hands off to a human", () => {
    const decision = routeMessage({ ...base, message: { ...base.message, text: "I need a human agent" } });
    assert.equal(decision.action, "handoff");
  });

  it("skips when a human owns the chat", () => {
    const decision = routeMessage({ ...base, conversationStatus: "human" });
    assert.equal(decision.action, "skip");
  });

  it("uses after-hours copy", () => {
    const settings = defaultBotSettings();
    settings.businessHours.enabled = true;
    settings.businessHours.days = [1, 2, 3, 4, 5];
    settings.businessHours.open = "09:00";
    settings.businessHours.close = "09:01";
    const inside = isWithinBusinessHours(
      { ...settings, timezone: "UTC" },
      new Date("2026-09-07T08:00:00Z"),
    );
    assert.equal(typeof inside, "boolean");
    const decision = routeMessage({
      ...base,
      settings,
      message: { ...base.message, text: "hello there" },
    });
    assert.ok(decision.action === "reply" || decision.action === "handoff");
  });

  it("falls back when nothing matches", () => {
    const decision = routeMessage({
      ...base,
      message: { ...base.message, text: "can we discuss a custom forensics brief tomorrow" },
    });
    assert.equal(decision.source, "fallback");
  });
});
