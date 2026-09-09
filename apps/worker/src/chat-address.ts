export type MessageKey = {
  id?: string | null;
  fromMe?: boolean | null;
  remoteJid?: string | null;
  remoteJidAlt?: string | null;
  participant?: string | null;
  participantAlt?: string | null;
  participantPn?: string | null;
  senderPn?: string | null;
};

export function isSendableJid(jid: string) {
  return Boolean(jid && jid.includes("@") && !jid.startsWith("@"));
}

export function resolveChat(key: MessageKey) {
  const chatJid = key.remoteJid || key.remoteJidAlt || key.participant || key.participantAlt || "";
  const phoneHints = [key.senderPn, key.participantPn, key.remoteJidAlt, key.participantAlt, key.remoteJid, key.participant]
    .filter((row): row is string => Boolean(row))
    .join(" ");
  return { chatJid, phoneHints };
}
