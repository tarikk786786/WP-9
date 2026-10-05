import test from "node:test";
import assert from "node:assert/strict";
import { CANONICAL_ASSISTANT_ID } from "@bot/shared";
import { assistantRegistry, AssistantRegistry } from "./assistant-registry.ts";
import { conversationRegistry } from "./conversation-registry.ts";

test("Assistant Registry: canonical identity and capabilities", () => {
  assert.equal(assistantRegistry.getAssistantId(), CANONICAL_ASSISTANT_ID);
  const def = assistantRegistry.getDefinition();
  assert.equal(def.assistantId, "c265b894-3638-4dc3-8bb7-8357a69b9503");
  assert.equal(def.status, "active");
  assert.ok(assistantRegistry.hasCapability("whatsapp_messaging"));
  assert.ok(assistantRegistry.hasCapability("voice_calling"));
  assert.ok(assistantRegistry.hasCapability("tool_execution"));
  assert.ok(assistantRegistry.hasCapability("long_term_memory"));
});

test("Conversation Registry: maps chat and call contexts under assistantId", () => {
  const chatContext = conversationRegistry.createAssistantContext({
    chatId: "919876543210@s.whatsapp.net",
    participantId: "919876543210",
    turnId: "turn_test_101",
    channel: "whatsapp_chat",
  });

  assert.equal(chatContext.assistantId, CANONICAL_ASSISTANT_ID);
  assert.equal(chatContext.memoryScope, "contact");
  assert.equal(chatContext.turnId, "turn_test_101");
  assert.ok(chatContext.conversationId.startsWith("conv_919876543210"));

  // Group chat scope
  const groupContext = conversationRegistry.createAssistantContext({
    chatId: "123456789-987654@g.us",
    participantId: "919876543210",
    turnId: "turn_test_102",
  });

  assert.equal(groupContext.assistantId, CANONICAL_ASSISTANT_ID);
  assert.equal(groupContext.memoryScope, "group");
  assert.equal(groupContext.groupId, "123456789-987654@g.us");
});
