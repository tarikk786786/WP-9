import test from "node:test";
import assert from "node:assert/strict";
import { BaileysProvider } from "./baileys-provider.ts";
import { EvolutionProvider } from "./evolution-provider.ts";
import type { NormalizedMessage } from "@bot/shared";

test("Gateways: BaileysProvider delegates outbound text messaging", async () => {
  let sentJid = "";
  let sentText = "";

  const provider = new BaileysProvider({
    async sendText(jid, text) {
      sentJid = jid;
      sentText = text;
      return "baileys_msg_123";
    },
    isConnected() {
      return true;
    },
    getPhone() {
      return "919114411026";
    },
  });

  const res = await provider.sendTextMessage("918984473230@s.whatsapp.net", "Hello from provider");
  assert.equal(res.ok, true);
  assert.equal(res.messageId, "baileys_msg_123");
  assert.equal(sentJid, "918984473230@s.whatsapp.net");
  assert.equal(sentText, "Hello from provider");

  const health = provider.getHealth();
  assert.equal(health.connected, true);
  assert.equal(health.phone, "919114411026");
});

test("Gateways: EvolutionProvider processes inbound webhook upsert events", async () => {
  const provider = new EvolutionProvider({
    baseUrl: "http://localhost:8080",
    apiKey: "test_key",
    instanceName: "wp9_instance",
  });

  const receivedMessages: NormalizedMessage[] = [];
  provider.onMessage(async (msg) => {
    receivedMessages.push(msg);
  });

  const webhookPayload = {
    event: "messages.upsert",
    data: {
      key: {
        id: "evo_msg_999",
        remoteJid: "919876543210@s.whatsapp.net",
        fromMe: false,
      },
      pushName: "Rahul Sharma",
      message: {
        conversation: "Hello, I need pricing details",
      },
      messageTimestamp: 1726000000,
    },
  };

  await provider.handleWebhookPayload(webhookPayload);

  assert.equal(receivedMessages.length, 1);
  assert.equal(receivedMessages[0].id, "evo_msg_999");
  assert.equal(receivedMessages[0].fromName, "Rahul Sharma");
  assert.equal(receivedMessages[0].text, "Hello, I need pricing details");
  assert.equal(receivedMessages[0].type, "text");
});
