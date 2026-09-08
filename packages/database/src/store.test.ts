import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { upsertCustomer, upsertConversation, wasProcessed, addMessage, markProcessed } from "./index.ts";

describe("memory store", () => {
  it("creates a customer and conversation", async () => {
    const user = await upsertCustomer({ number: "9198", name: "Amina" });
    const convo = await upsertConversation(user.id, "9198@s.whatsapp.net");
    assert.equal(convo.chat_id, "9198@s.whatsapp.net");
    assert.equal(convo.status, "bot");
  });

  it("tracks processed message ids in memory", async () => {
    await markProcessed("dup-1");
    assert.equal(await wasProcessed("dup-1"), true);
    assert.equal(await wasProcessed("dup-2"), false);
  });

  it("stores inbound and outbound messages", async () => {
    const user = await upsertCustomer({ number: "91x", name: "A" });
    const convo = await upsertConversation(user.id, "91x@s.whatsapp.net");
    const msg = await addMessage({
      conversation_id: convo.id,
      whatsapp_message_id: "w-99",
      direction: "in",
      message_type: "text",
      text: "hi",
      media_reference: null,
      ai_generated: false,
      intent: "greeting",
    });
    assert.equal(msg.text, "hi");
  });
});
