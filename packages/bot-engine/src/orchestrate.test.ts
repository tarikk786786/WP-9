import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeTurn } from "./orchestrate/intelligence.ts";
import { checkReplyQuality } from "./orchestrate/quality.ts";
import { polishHumanReply, blendSpokenReply } from "./orchestrate/polish.ts";
import { combineBurstText } from "./orchestrate/debounce.ts";
import { analyzeMessage } from "./ai/analyze.ts";
import { missedAsks } from "./ai/score.ts";
import { stitchMissingAsks } from "./ai/fallback.ts";
import { writeSpokenReply } from "./orchestrate/spoken.ts";
import { stripModelNoise } from "./orchestrate/compose.ts";

describe("conversation intelligence", () => {
  it("acknowledges a thanks without needing a model", () => {
    const turn = analyzeTurn("thanks bro", [], false);
    assert.equal(turn.plan.action, "acknowledge");
    assert.ok(turn.plan.draft);
  });

  it("clarifies a dangling follow-up using thread context", () => {
    const turn = analyzeTurn("tomorrow?", [{ role: "user", text: "can you send the brief today?" }], false);
    assert.equal(turn.plan.action, "clarify");
    assert.match(turn.plan.draft ?? "", /baat/i);
  });

  it("reads a messy multi-ask the way a person would", () => {
    const turn = analyzeTurn(
      "hey tarik, dezo se webiste banana hai. process kya hai, price kaise decide hota hai, aur site kahan dekhun?",
      [],
      true,
    );
    assert.ok(turn.analysis.asks.length >= 3);
    assert.match(turn.analysis.meaning, /rate|process|site|dezo/i);
    assert.equal(turn.plan.action, "answer");
    assert.equal(turn.analysis.preferredStyle, "complete");
    assert.ok(!turn.analysis.topics.includes("location"));
    assert.doesNotMatch(turn.analysis.asks.join(" "), /kahan se kaam/i);
  });

  it("weaves site into spoken lines and never dumps India on a link ask", () => {
    const analysis = analyzeMessage(
      "hey tarik, dezo se website banana hai. process kya hai, price kaise decide hota hai, aur site kahan dekhun?",
      { isFirstMessage: true },
    );
    const dumped =
      "dezo mera studio hai, dezo.in pe dekh sakte ho. main india se kaam karta hoon. rate andaz se nahi bolta.\ntarikislam.in pe public cheez hai\npehle sunta hoon, phir jo clear ho wohi kehta hoon";
    const blended = blendSpokenReply(dumped, analysis);
    assert.match(blended, /dezo/i);
    assert.match(blended, /tarikislam\.in/i);
    assert.match(blended, /andaz|pehle sunta/i);
    assert.doesNotMatch(blended, /india/i);
    const siteOnOwnLine = blended.split("\n").some((line) => /^tarikislam\.in pe public cheez hai$/i.test(line.trim()));
    assert.equal(siteOnOwnLine, false);
  });

  it("maps a price typo onto pricing intent", () => {
    const turn = analyzeTurn("pric pls", [], true);
    assert.match(turn.plan.intent, /pricing/);
  });

  it("does not ignore a price ask hidden in typos", () => {
    const turn = analyzeTurn("pric pls webiste banana hai", [], true);
    assert.ok(turn.analysis.intents.includes("pricing"));
    assert.ok(turn.analysis.intents.includes("project"));
    assert.notEqual(turn.plan.action, "ask");
  });

  it("rejects invented prices", () => {
    const analysis = analyzeMessage("kitna lagega website ka?");
    const check = checkReplyQuality("rate 45000 rs hai", analysis, ["rate andaz se nahi bolta"]);
    assert.equal(check.ok, false);
    assert.ok(check.reasons.includes("invented-price"));
  });

  it("rejects boastful copy", () => {
    const analysis = analyzeMessage("can you do security?");
    const check = checkReplyQuality("I am the best, audits are my thing, guaranteed.", analysis, []);
    assert.equal(check.ok, false);
  });

  it("rejects lead-desk and on-behalf copy", () => {
    const analysis = analyzeMessage("website banana hai");
    const lead = checkReplyQuality("send 3 lines: kya banana hai, kis ke liye, kab tak. brief chahiye.", analysis, []);
    const behalf = checkReplyQuality("I am writing on behalf of Tarik. Thanks for reaching out.", analysis, []);
    assert.equal(lead.ok, false);
    assert.equal(behalf.ok, false);
  });

  it("keeps a short hire ask as a person, not a quote form", () => {
    const turn = analyzeTurn("I want to hire you for a website", [], true);
    assert.equal(turn.plan.action, "ask");
    assert.match(turn.plan.draft ?? "", /bata kya soch/i);
    assert.doesNotMatch(turn.plan.draft ?? "", /3 lines|rate scope|brief/i);
  });

  it("answers are-you-a-bot as Tarik, without naming AI", () => {
    const turn = analyzeTurn("are you a bot?", [], true);
    assert.equal(turn.plan.action, "acknowledge");
    assert.match(turn.plan.draft ?? "", /main hi hoon/i);
    assert.doesNotMatch(turn.plan.draft ?? "", /\b(ai|bot|chatgpt|auto)\b/i);
    const check = checkReplyQuality("I am an AI assistant, not Tarik.", analyzeMessage("are you a bot?"), []);
    assert.equal(check.ok, false);
  });

  it("acks a bare ok without asking a new question", () => {
    const turn = analyzeTurn("ok", [{ role: "user", text: "brief bhej dena" }], false);
    assert.equal(turn.plan.action, "acknowledge");
    assert.equal(turn.plan.draft, "ok bhai");
  });

  it("asks what tomorrow is about instead of agreeing blindly", () => {
    const turn = analyzeTurn("kal?", [], true);
    assert.equal(turn.plan.action, "clarify");
    assert.match(turn.plan.draft ?? "", /kal/i);
  });

  it("joins a burst into one message", () => {
    assert.equal(combineBurstText(["hi", "bro", "you there"]), "hi\nbro\nyou there");
  });

  it("keeps hi and thanks as one human line", () => {
    const hi = analyzeTurn("hi", [], true);
    const thanks = analyzeTurn("thanks", [], false);
    assert.equal(hi.plan.action, "acknowledge");
    assert.match(hi.plan.draft ?? "", /kya haal|bolo/i);
    assert.doesNotMatch(hi.plan.draft ?? "", /\n/);
    assert.equal(thanks.plan.action, "acknowledge");
    assert.match(thanks.plan.draft ?? "", /koi baat nahi/i);
  });

  it("rejects scope-pe-depend and fills a thin typo price+build reply", () => {
    const analysis = analyzeMessage("pric pls webiste banana hai", { isFirstMessage: true });
    assert.equal(checkReplyQuality("rate andaz se nahi bolta, scope pe depend karta hai.", analysis, []).ok, false);
    const polished = polishHumanReply(
      "rate andaz se nahi bolta, scope pe depend karta hai.\nbatao kya banana soch rahe ho?",
      "pric pls webiste banana hai",
      analysis,
    );
    assert.doesNotMatch(polished, /scope pe depend/i);
    const filled = stitchMissingAsks(polished, analysis, missedAsks(polished, analysis));
    assert.match(filled, /andaz|bata|soch/i);
  });

  it("strips a second greeting and leftover sales english", () => {
    const analysis = analyzeMessage("hey, process kya hai aur rate?");
    const text = polishHumanReply(
      "hey, bolo\nprocess simple hai\nWe can definitely talk.\nrate scope pe depend karta hai?",
      "hey, process kya hai aur rate?",
      analysis,
    );
    assert.doesNotMatch(text, /hey, bolo/i);
    assert.doesNotMatch(text, /definitely/i);
  });

  it("answers the stuck WhatsApp loop without repeating dekh liya. bolo", () => {
    const turns = [
      ["Kya", /kya baat/i],
      ["Aaj ka horoscope kya hai", /nahi dekhta/i],
      ["Bolo", /sun raha/i],
      ["Kya hua tumhe", /theek hoon/i],
    ] as const;
    for (const [text, expect] of turns) {
      const turn = analyzeTurn(text, [], false);
      assert.ok(turn.plan.draft);
      assert.match(turn.plan.draft ?? "", expect);
      assert.doesNotMatch(turn.plan.draft ?? "", /^dekh liya\.?\s*bolo/i);
    }
    const firstBolo = analyzeTurn("Bolo", [], false);
    const secondBolo = analyzeTurn("Bolo", [
      { role: "user", text: "Bolo" },
      { role: "assistant", text: firstBolo.plan.draft ?? "" },
    ], false);
    assert.notEqual(secondBolo.plan.draft, firstBolo.plan.draft);
    assert.doesNotMatch(secondBolo.plan.draft ?? "", /^dekh liya\.?\s*bolo/i);
  });

  it("rejects the canned fallback as empty", () => {
    const analysis = analyzeMessage("kya");
    const check = checkReplyQuality("dekh liya. bolo", analysis, []);
    assert.equal(check.ok, false);
  });

  it("answers real asks from facts instead of stalling", () => {
    const price = writeSpokenReply("kitna lagega website ka?", analyzeMessage("kitna lagega website ka?"));
    assert.match(price, /andaz/i);
    assert.doesNotMatch(price, /^dekh liya/i);
    const site = writeSpokenReply("portfolio kahan dekhun", analyzeMessage("portfolio kahan dekhun"));
    assert.match(site, /tarikislam\.in/i);
    const english = writeSpokenReply(
      "How much does a website cost roughly?",
      analyzeMessage("How much does a website cost roughly?"),
    );
    assert.match(english, /rate|quote|offhand/i);
    assert.doesNotMatch(english, /sun raha hoon\. thoda clearly/i);
  });

  it("follows a short 'and the site' after a work thread", () => {
    const reply = writeSpokenReply("aur site?", analyzeMessage("aur site?"), [
      { role: "user", text: "website banana hai" },
      { role: "assistant", text: "haan, bata kya soch rahe ho" },
    ]);
    assert.match(reply, /tarikislam\.in|dezo/i);
  });

  it("strips model thinking junk", () => {
    const clean = stripModelNoise("<think>plan the reply</think>\n**haan**, sun raha hoon");
    assert.equal(clean, "haan, sun raha hoon");
  });
});
