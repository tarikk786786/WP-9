import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSendableJid, resolveChat } from "./chat-address.ts";

describe("chat addressing", () => {
  it("keeps LID chat jid for send, but surfaces the phone for DAZy matching", () => {
    const { chatJid, phoneHints } = resolveChat({
      remoteJid: "217329656955113@lid",
      senderPn: "917903956968",
      remoteJidAlt: "917903956968@s.whatsapp.net",
    });
    assert.equal(chatJid, "217329656955113@lid");
    assert.match(phoneHints, /917903956968/);
    assert.equal(isSendableJid(chatJid), true);
    assert.equal(isSendableJid(""), false);
  });
});
