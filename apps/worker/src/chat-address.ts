export type MessageKey = {
  id?: string | null;
  fromMe?: boolean | null;
  remoteJid?: string | null;
  remoteJidAlt?: string | null;
  participant?: string | null;
  participantAlt?: string | null;
  participantPn?: string | null;
  senderPn?: string | null;
  senderLid?: string | null;
  participantLid?: string | null;
};

// Known pre-mapped LIDs (such as DAZY's known LID from live multi-device traffic)
const KNOWN_LID_PHONE_MAP: Record<string, string> = {
  "232839253623024@lid": "917903956968@s.whatsapp.net",
  "232839253623024": "917903956968@s.whatsapp.net",
};

const lidToPhone = new Map<string, string>(Object.entries(KNOWN_LID_PHONE_MAP));
const phoneToLid = new Map<string, string>();
for (const [lid, phone] of Object.entries(KNOWN_LID_PHONE_MAP)) {
  phoneToLid.set(phone, lid);
}

export function registerLidMapping(lid: string, phone: string) {
  if (!lid || !phone) return;
  const cleanLid = lid.includes("@") ? lid : `${lid}@lid`;
  let cleanPhone = phone;
  if (!cleanPhone.includes("@")) {
    const digits = cleanPhone.replace(/\D/g, "");
    if (digits.length >= 10) {
      cleanPhone = `${digits}@s.whatsapp.net`;
    }
  }
  if (cleanPhone.endsWith("@s.whatsapp.net")) {
    lidToPhone.set(cleanLid, cleanPhone);
    phoneToLid.set(cleanPhone, cleanLid);
  }
}

export function resolveSendJid(jid: string): string {
  if (!jid) return "";
  if (jid.endsWith("@lid")) {
    const mapped = lidToPhone.get(jid);
    if (mapped) return mapped;
  }
  return jid;
}

export function isSendableJid(jid: string) {
  return Boolean(jid && jid.includes("@") && !jid.startsWith("@"));
}

export function resolveChat(key: MessageKey): { chatJid: string; phoneHints: string } {
  const remote = key.remoteJid || "";
  const alt = key.remoteJidAlt || "";
  const participant = key.participant || "";
  const participantAlt = key.participantAlt || "";

  // Extract any potential phone number from metadata fields
  const candidates = [
    alt.endsWith("@s.whatsapp.net") ? alt : null,
    participantAlt.endsWith("@s.whatsapp.net") ? participantAlt : null,
    key.senderPn ? `${key.senderPn.replace(/\D/g, "")}@s.whatsapp.net` : null,
    key.participantPn ? `${key.participantPn.replace(/\D/g, "")}@s.whatsapp.net` : null,
  ].filter((c): c is string => Boolean(c && c.replace(/@s\.whatsapp\.net$/, "").length >= 10 && c.endsWith("@s.whatsapp.net")));

  const discoveredPhoneJid = candidates[0] ?? null;

  let chatJid = remote;

  // 1. Groups, broadcasts, newsletters must preserve their destination JID
  if (remote.endsWith("@g.us") || remote.endsWith("@broadcast") || remote.endsWith("@newsletter")) {
    chatJid = remote;
  } else if (remote.endsWith("@lid")) {
    // 2. If remoteJid is an LID:
    if (discoveredPhoneJid) {
      registerLidMapping(remote, discoveredPhoneJid);
      chatJid = discoveredPhoneJid;
    } else if (lidToPhone.has(remote)) {
      chatJid = lidToPhone.get(remote)!;
    } else {
      chatJid = remote;
    }
  } else if (remote.endsWith("@s.whatsapp.net")) {
    chatJid = remote;
    if (key.senderLid) {
      registerLidMapping(key.senderLid, remote);
    }
  } else {
    chatJid = discoveredPhoneJid || remote || alt || participant || participantAlt || "";
  }

  const phoneHints = [
    key.senderPn,
    key.participantPn,
    key.remoteJidAlt,
    key.participantAlt,
    chatJid,
    key.remoteJid,
    key.participant,
  ]
    .filter((row): row is string => Boolean(row))
    .join(" ");

  return { chatJid, phoneHints };
}

