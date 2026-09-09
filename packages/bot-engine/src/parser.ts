import type { NormalizedMessage } from "@bot/shared";

export function normalizeIncoming(input: {
  id: string;
  jid: string;
  fromMe: boolean;
  pushName?: string;
  message?: Record<string, unknown> | null;
  timestamp?: number;
}): NormalizedMessage | null {
  if (input.fromMe) return null;
  const jid = input.jid;
  if (!jid || jid === "status@broadcast" || jid.endsWith("@broadcast")) return null;
  const msg = unwrapMessage(input.message ?? {});
  const type = detectType(msg);
  const text = extractText(msg);
  return {
    id: `wa_${input.id}`,
    whatsappMessageId: input.id,
    sender: jid,
    chatId: jid,
    fromName: input.pushName || jid.replace(/@s\.whatsapp\.net$/, ""),
    type,
    text,
    timestamp: new Date((input.timestamp || Date.now() / 1000) * 1000).toISOString(),
    isGroup: jid.endsWith("@g.us"),
    metadata: { rawKeys: Object.keys(msg) },
  };
}

function unwrapMessage(message: Record<string, unknown>): Record<string, unknown> {
  const nested =
    (message.ephemeralMessage as { message?: Record<string, unknown> } | undefined)?.message ??
    (message.viewOnceMessage as { message?: Record<string, unknown> } | undefined)?.message ??
    (message.viewOnceMessageV2 as { message?: Record<string, unknown> } | undefined)?.message ??
    (message.viewOnceMessageV2Extension as { message?: Record<string, unknown> } | undefined)?.message ??
    (message.documentWithCaptionMessage as { message?: Record<string, unknown> } | undefined)?.message ??
    (message.editedMessage as { message?: Record<string, unknown> } | undefined)?.message;
  return nested ? unwrapMessage(nested) : message;
}

function detectType(message: Record<string, unknown>): NormalizedMessage["type"] {
  if (typeof message.conversation === "string" || message.extendedTextMessage) return "text";
  if (message.imageMessage) return "image";
  if (message.audioMessage || message.pttMessage) return "audio";
  if (message.videoMessage) return "video";
  if (message.documentMessage) return "document";
  if (message.stickerMessage) return "sticker";
  if (message.locationMessage || message.liveLocationMessage) return "location";
  if (message.contactMessage || message.contactsArrayMessage) return "contact";
  if (message.reactionMessage) return "reaction";
  if (message.buttonsResponseMessage) return "buttons";
  if (message.listResponseMessage) return "list";
  return "unknown";
}

function extractText(message: Record<string, unknown>): string {
  if (typeof message.conversation === "string") return message.conversation;
  const extended = message.extendedTextMessage as { text?: string } | undefined;
  if (extended?.text) return extended.text;
  const ephemeral = message.ephemeralMessage as { message?: Record<string, unknown> } | undefined;
  if (ephemeral?.message) return extractText(ephemeral.message);
  const image = message.imageMessage as { caption?: string } | undefined;
  if (image?.caption) return image.caption;
  if (message.imageMessage) return "[image]";
  if (message.audioMessage || message.pttMessage) return "[voice]";
  if (message.videoMessage) return "[video]";
  if (message.documentMessage) return "[document]";
  if (message.stickerMessage) return "[sticker]";
  if (message.locationMessage) return "[location]";
  if (message.contactMessage) return "[contact]";
  return "";
}

const seen = new Set<string>();

export function isDuplicate(whatsappMessageId: string): boolean {
  if (seen.has(whatsappMessageId)) return true;
  seen.add(whatsappMessageId);
  if (seen.size > 2000) {
    const first = seen.values().next().value;
    if (first) seen.delete(first);
  }
  return false;
}

export function resetDuplicates() {
  seen.clear();
}
