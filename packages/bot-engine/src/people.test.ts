import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findSpecialPerson } from "./people.ts";
import { analyzeTurn } from "./orchestrate/intelligence.ts";
import { writeSpokenReply } from "./orchestrate/spoken.ts";
import { analyzeMessage } from "./ai/analyze.ts";
import { buildPrompt } from "./ai/provider.ts";
import { defaultBotSettings } from "@bot/shared";

describe("DAZy love voice", () => {
  const dazy = findSpecialPerson({ number: "+91 79039 56968" });

  it("recognises DAZy's number and name", () => {
    assert.equal(dazy?.id, "dazy");
    assert.equal(findSpecialPerson({ jid: "917903956968@s.whatsapp.net" })?.name, "DAZy");
    assert.equal(findSpecialPerson({ fromName: "DAZy" })?.voice, "love");
    assert.equal(findSpecialPerson({ number: "9198" }), null);
  });

  it("greets her as love, not as bhai", () => {
    const turn = analyzeTurn("hi", [], true, dazy ?? undefined);
    assert.match(turn.plan.draft ?? "", /dazy|jaan|love/i);
    assert.doesNotMatch(turn.plan.draft ?? "", /\bbhai\b/i);
    const spoken = writeSpokenReply("hi", analyzeMessage("hi"), [], dazy ?? undefined);
    assert.match(spoken, /dazy|jaan|love/i);
    assert.doesNotMatch(spoken, /\bbhai\b/i);
  });

  it("keeps the model prompt on DAZy, not the desk", () => {
    const prompt = buildPrompt(
      {
        id: "1",
        whatsappMessageId: "w",
        sender: "917903956968@s.whatsapp.net",
        chatId: "917903956968@s.whatsapp.net",
        fromName: "DAZy",
        type: "text",
        text: "miss you",
        timestamp: new Date().toISOString(),
        isGroup: false,
        metadata: {},
      },
      {
        settings: defaultBotSettings(),
        customerName: "DAZy",
        recent: [],
        faqs: [],
        knowledge: [],
        person: dazy ?? undefined,
      },
    );
    assert.match(prompt.system, /DAZy/);
    assert.match(prompt.system, /love|jaan/i);
    assert.doesNotMatch(prompt.system, /texting a brother/i);
  });
});
