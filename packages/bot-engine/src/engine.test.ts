import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultAutomationRules, defaultBotSettings, defaultFaqs } from "@bot/shared";
import { isDuplicate, normalizeIncoming, resetDuplicates } from "./parser.ts";
import { isWithinBusinessHours, matchFaq, matchRule, routeMessage } from "./router.ts";
import { analyzeMessage, buildPrompt, missedAsks, planReplyEngines, scoreReplyCompleteness, writeCompleteFallback } from "./ai/provider.ts";
import { stitchMissingAsks } from "./ai/fallback.ts";

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

  it("asks the model to sound like a person", () => {
    const prompt = buildPrompt(base.message, {
      settings: defaultBotSettings(),
      customerName: "Amina",
      recent: [{ role: "user", text: "hi" }],
      faqs: ["Who: tarik"],
      knowledge: [],
      intent: "greeting",
      suggested: "hey, kya scene hai",
    });
    assert.match(prompt.system, /first person/i);
    assert.match(prompt.system, /you ARE tarik islam/i);
    assert.match(prompt.system, /you are him/i);
    assert.match(prompt.user, /Amina/);
  });

  it("does not lock a multi-ask first message onto a single FAQ", () => {
    const decision = routeMessage({
      ...base,
      message: {
        ...base.message,
        text: "hey, dezo se website banana hai. process kya hai, price kaise decide hota hai, aur site kahan dekhun?",
      },
    });
    assert.notEqual(decision.source, "faq");
    assert.notEqual(decision.source, "rule");
  });
});

describe("message analysis and engine pick", () => {
  it("extracts every ask on a first lead message", () => {
    const analysis = analyzeMessage(
      "hey tarik, dezo se website banana hai. process kya hai? price kaise decide hota hai? portfolio kahan hai?",
      { isFirstMessage: true },
    );
    assert.equal(analysis.isFirstMessage, true);
    assert.ok(analysis.wantsAllAnswers);
    assert.ok(analysis.questions.length >= 2);
    assert.ok(analysis.intents.includes("studio"));
    assert.ok(analysis.intents.includes("website") || analysis.intents.includes("project"));
    assert.ok(analysis.intents.includes("process"));
    assert.ok(analysis.intents.includes("pricing"));
    assert.equal(analysis.preferredStyle, "complete");
    assert.ok(analysis.asks.length >= 3);
    assert.match(analysis.meaning, /rate|process|portfolio|site/i);
  });

  it("keeps a lone greeting short", () => {
    const analysis = analyzeMessage("hey", { isFirstMessage: true });
    assert.equal(analysis.complexity, "simple");
    assert.equal(analysis.intents[0], "greeting");
  });

  it("picks gpt-4o first for a complete lead when OpenAI is available", () => {
    const previousOpen = process.env.OPENAI_API_KEY;
    const previousGroq = process.env.GROQ_API_KEY;
    process.env.OPENAI_API_KEY = "sk-test";
    delete process.env.GROQ_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const analysis = analyzeMessage("website banana hai, process aur rate dono bata, dezo ke through", {
      isFirstMessage: true,
    });
    const plans = planReplyEngines(analysis);
    assert.equal(plans[0]?.engine, "gpt-4o");
    assert.ok((plans[0]?.maxTokens ?? 0) >= 300);
    if (previousOpen) process.env.OPENAI_API_KEY = previousOpen;
    else delete process.env.OPENAI_API_KEY;
    if (previousGroq) process.env.GROQ_API_KEY = previousGroq;
    else delete process.env.GROQ_API_KEY;
  });

  it("picks groq first on a cheap hybrid turn when Groq is configured", () => {
    const previousGroq = process.env.GROQ_API_KEY;
    process.env.GROQ_API_KEY = "gsk-test";
    process.env.AI_POLICY = "hybrid";
    const analysis = analyzeMessage("ok noted, thanks", { isFirstMessage: false });
    const plans = planReplyEngines(analysis);
    assert.equal(plans[0]?.engine, "groq");
    if (previousGroq) process.env.GROQ_API_KEY = previousGroq;
  });

  it("writes a fallback that answers more than one topic", () => {
    const analysis = analyzeMessage("dezo studio hai kya, website kahan hai, rate kaise?", { isFirstMessage: true });
    const text = writeCompleteFallback(analysis);
    assert.match(text, /dezo/i);
    assert.match(text, /tarikislam\.in/i);
    assert.match(text, /rate/i);
    assert.doesNotMatch(text, /3 lines|on behalf|lead form|number dunga/i);
    assert.ok(scoreReplyCompleteness(text, analysis) >= 0.5);
  });

  it("stitches process and personal site when a draft skips them", () => {
    const analysis = analyzeMessage(
      "hey tarik, dezo se website banana hai. process kya hai, price kaise decide hota hai, aur site kahan dekhun?",
      { isFirstMessage: true },
    );
    const thin = "Dezo mera studio hai, dezo.in pe site dekh sakte ho.\nRate andaz se nahi bolta.";
    const missed = missedAsks(thin, analysis);
    assert.ok(missed.length >= 1);
    const full = stitchMissingAsks(thin, analysis, missed);
    assert.match(full, /pehle sunta|jo clear/i);
    assert.match(full, /tarikislam\.in/i);
    assert.match(full, /dezo/i);
    assert.match(full, /andaz/i);
    assert.ok(scoreReplyCompleteness(full, analysis) >= 0.7);
  });
});
