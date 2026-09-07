import { createHmac, timingSafeEqual } from "node:crypto";

export const GRAPH_API_VERSION = "v21.0";

export function getWhatsAppConfig() {
  return {
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN?.trim() ?? "",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() ?? "",
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN?.trim() ?? "",
    appSecret: process.env.WHATSAPP_APP_SECRET?.trim() ?? "",
  };
}

export function isWhatsAppConfigured() {
  const config = getWhatsAppConfig();
  return Boolean(config.accessToken && config.phoneNumberId && config.verifyToken);
}

export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null) {
  const { appSecret } = getWhatsAppConfig();
  if (!appSecret) return true;
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const provided = signatureHeader.slice("sha256=".length);
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function sendWhatsAppText(to: string, body: string) {
  const { accessToken, phoneNumberId } = getWhatsAppConfig();
  if (!accessToken || !phoneNumberId) {
    throw new Error("WhatsApp Cloud API is not configured.");
  }

  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { preview_url: false, body },
      }),
    },
  );

  const payload = (await response.json()) as { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(payload.error?.message ?? "WhatsApp send failed.");
  }
  return payload;
}

type IncomingText = {
  from: string;
  fromName: string;
  id: string;
  body: string;
};

type WebhookPayload = {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
        messages?: Array<{
          from?: string;
          id?: string;
          type?: string;
          text?: { body?: string };
        }>;
        statuses?: unknown[];
      };
    }>;
  }>;
};

export function extractIncomingTexts(payload: WebhookPayload): IncomingText[] {
  if (payload.object !== "whatsapp_business_account") return [];

  const messages: IncomingText[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.messages?.length) continue;

      const nameByWaId = new Map(
        (value.contacts ?? []).map((contact) => [
          contact.wa_id ?? "",
          contact.profile?.name ?? "",
        ]),
      );

      for (const message of value.messages) {
        if (message.type !== "text" || !message.text?.body || !message.from || !message.id) {
          continue;
        }
        messages.push({
          from: message.from,
          fromName: nameByWaId.get(message.from) || message.from,
          id: message.id,
          body: message.text.body,
        });
      }
    }
  }
  return messages;
}
