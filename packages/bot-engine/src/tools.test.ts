import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  toolRegistry,
  normalizeHinglishText,
  analyzeUnderstanding,
  weatherTool,
  calculatorTool,
  shouldReplyTool,
  writeSpokenReply,
} from "./index.ts";

describe("Tool Registry and Multilingual Engine", () => {
  it("registers all tool categories and exports OpenAI format", () => {
    const tools = toolRegistry.listTools();
    assert.ok(tools.length >= 25, `Expected at least 25 tools, found ${tools.length}`);

    const formatted = toolRegistry.formatToolsForLLM();
    assert.equal(formatted.length, tools.length);
    assert.ok(formatted.some((t) => t.function.name === "weather"));
    assert.ok(formatted.some((t) => t.function.name === "normalize_text"));
    assert.ok(formatted.some((t) => t.function.name === "should_reply"));
  });

  it("normalizes difficult Hinglish shorthand and elongated letters", () => {
    const raw = "bhai kl mlt h kyaaa yr 😭";
    const res = normalizeHinglishText(raw);
    assert.ok(res.normalized.includes("kal"));
    assert.ok(res.normalized.includes("milte"));
    assert.ok(res.normalized.includes("yaar"));
    assert.ok(res.normalized.includes("kya"));
  });

  it("analyzes message understanding, sentiment, and time reference", () => {
    const raw = "bhai kl mlt h kyaaa yr 😭";
    const res = analyzeUnderstanding(raw);
    assert.equal(res.language, "hinglish");
    assert.equal(res.intent, "meeting_availability");
    assert.equal(res.timeReference, "tomorrow");
    assert.equal(res.tone, "frustrated");
  });

  it("answers weather inquiries naturally instead of failing", async () => {
    const weather = await weatherTool.execute({ location: "Bhubaneswar", when: "tomorrow" }, {});
    assert.equal(weather.success, true);
    assert.ok(weather.data);
    assert.ok(weather.data.summary.includes("Bhubaneswar"));
    assert.ok(weather.data.temperatureC > 0);
  });

  it("evaluates arithmetic calculations via calculator tool", async () => {
    const res = await calculatorTool.execute({ expression: "5000 + 18%" }, {});
    assert.equal(res.success, true);
    assert.equal(res.data?.result, 5900);
  });

  it("makes correct should_reply decisions for reactions and escalation", async () => {
    const laugh = await shouldReplyTool.execute({ text: "hahaha 😂" }, {});
    assert.equal(laugh.data?.decision, "REACT");
    assert.equal(laugh.data?.emoji, "😂");

    const escalate = await shouldReplyTool.execute({ text: "talk to human agent please" }, {});
    assert.equal(escalate.data?.decision, "ESCALATE");

    const normal = await shouldReplyTool.execute({ text: "kal milte hain kya?" }, {});
    assert.equal(normal.data?.decision, "RESPOND");
  });

  it("speaks naturally about meeting and weather in Tarik's voice", () => {
    const meetingReply = writeSpokenReply("kl mlt h kya");
    assert.ok(/kal milte/i.test(meetingReply));

    const weatherReply = writeSpokenReply("bhai kl baarish hogi kya");
    assert.ok(/baarish|mausam/i.test(weatherReply));
  });
});
