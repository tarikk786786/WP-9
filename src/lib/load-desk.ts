import { getLiveStatus } from "@/lib/live";
import { getInbox, getRules } from "@/lib/store";
import { GRAPH_API_VERSION, getWhatsAppConfig, isWhatsAppConfigured } from "@/lib/whatsapp";
import type { BotRules, ConnectionStatus, InboxMessage, LiveStatus } from "@/lib/types";

export type DeskData = {
  rules: BotRules;
  status: ConnectionStatus;
  inbox: InboxMessage[];
  live: LiveStatus;
};

function emptyLive(): LiveStatus {
  return {
    alive: true,
    startedAt: new Date().toISOString(),
    whatsapp: {
      phase: "idle",
      qrDataUrl: null,
      phone: null,
      error: null,
      persisted: false,
      savedAt: null,
      serverless: false,
    },
    llms: [],
  };
}

export async function loadDesk(): Promise<DeskData> {
  const config = getWhatsAppConfig();
  let live = emptyLive();
  try {
    live = await getLiveStatus();
  } catch {
    // Keep the desk rendering even if a local-model probe fails.
  }
  return {
    rules: await getRules(),
    inbox: await getInbox(),
    live,
    status: {
      configured: isWhatsAppConfigured(),
      hasAccessToken: Boolean(config.accessToken),
      hasPhoneNumberId: Boolean(config.phoneNumberId),
      hasVerifyToken: Boolean(config.verifyToken),
      hasAppSecret: Boolean(config.appSecret),
      graphApiVersion: GRAPH_API_VERSION,
    },
  };
}
