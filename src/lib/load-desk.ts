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

export async function loadDesk(): Promise<DeskData> {
  const config = getWhatsAppConfig();
  return {
    rules: await getRules(),
    inbox: await getInbox(),
    live: await getLiveStatus(),
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
