import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSendableJid, registerLidMapping, resolveChat, resolveSendJid } from "./chat-address.ts";

describe("chat addressing", () => {
  it("resolves phone JID when LID is accompanied by phone metadata", () => {
    const { chatJid, phoneHints } = resolveChat({
      remoteJid: "217329656955113@lid",
      senderPn: "917903956968",
      remoteJidAlt: "917903956968@s.whatsapp.net",
    });
    assert.equal(chatJid, "917903956968@s.whatsapp.net");
    assert.match(phoneHints, /917903956968/);
    assert.equal(isSendableJid(chatJid), true);
    assert.equal(isSendableJid(""), false);
  });

  it("resolves known DAZY LID even without explicit phone metadata", () => {
    const { chatJid } = resolveChat({
      remoteJid: "232839253623024@lid",
    });
    assert.equal(chatJid, "917903956968@s.whatsapp.net");
  });

  it("dynamically learns and translates LID to phone on send", () => {
    registerLidMapping("555123456789@lid", "919876543210@s.whatsapp.net");
    assert.equal(resolveSendJid("555123456789@lid"), "919876543210@s.whatsapp.net");
    assert.equal(resolveSendJid("919876543210@s.whatsapp.net"), "919876543210@s.whatsapp.net");
  });

  it("preserves group jids without alteration", () => {
    const { chatJid } = resolveChat({
      remoteJid: "123456789-987654@g.us",
      senderPn: "917903956968",
    });
    assert.equal(chatJid, "123456789-987654@g.us");
  });
});

