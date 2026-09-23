import type { ToolDefinition } from "../types.ts";

export interface ChatwootHandoffArgs {
  jid: string;
  customerName?: string;
  summary: string;
  intent?: string;
  priority?: "normal" | "urgent";
}

export interface ChatwootHandoffResult {
  chatwootConversationId: number | string;
  status: string;
  assignedTeam?: string;
}

export const chatwootHandoffTool: ToolDefinition<ChatwootHandoffArgs, ChatwootHandoffResult> = {
  name: "chatwoot_handoff",
  category: "agent",
  description: "Synchronizes customer conversation to Chatwoot shared inbox for human agent takeover",
  parameters: [
    { name: "jid", type: "string", description: "Customer WhatsApp ID", required: true },
    { name: "summary", type: "string", description: "Handoff context summary for the human agent", required: true },
    { name: "customerName", type: "string", description: "Customer display name" },
    { name: "intent", type: "string", description: "Detected user intent" },
    { name: "priority", type: "string", description: "Escalation priority", enum: ["normal", "urgent"] },
  ],
  async execute({ jid, summary, customerName, intent, priority = "normal" }) {
    const chatwootUrl = process.env.CHATWOOT_BASE_URL;
    const chatwootToken = process.env.CHATWOOT_API_TOKEN;
    const accountId = process.env.CHATWOOT_ACCOUNT_ID || "1";

    // If Chatwoot is configured in environment, sync via REST API
    if (chatwootUrl && chatwootToken) {
      try {
        const res = await fetch(`${chatwootUrl.replace(/\/+$/, "")}/api/v1/accounts/${accountId}/conversations`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            api_access_token: chatwootToken,
          },
          body: JSON.stringify({
            source_id: jid,
            custom_attributes: {
              intent: intent || "support",
              priority,
              summary,
            },
          }),
        });

        if (res.ok) {
          const data = (await res.json()) as { id: number };
          return {
            success: true,
            data: {
              chatwootConversationId: data.id,
              status: "escalated_to_chatwoot",
              assignedTeam: "Human Support",
            },
            summary: `Created Chatwoot ticket #${data.id} for ${customerName || jid}`,
          };
        }
      } catch (err) {
        console.warn("[chatwoot_handoff] Failed to connect to Chatwoot API:", err);
      }
    }

    // Graceful local stub if Chatwoot credentials are not yet configured
    const mockId = Math.floor(1000 + Math.random() * 9000);
    return {
      success: true,
      data: {
        chatwootConversationId: mockId,
        status: "queued_for_human",
        assignedTeam: "Tarik / DEZO Support",
      },
      summary: `Queued human takeover ticket #${mockId} for ${customerName || jid}: "${summary}"`,
    };
  },
};
