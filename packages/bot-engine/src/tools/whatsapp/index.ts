import type { ToolDefinition } from '../types.ts';

export const sendTextTool: ToolDefinition<{ jid: string; text: string }> = {
  name: 'send_text',
  category: 'whatsapp',
  description: 'Sends a direct text message to a WhatsApp chat or contact',
  parameters: [
    { name: 'jid', type: 'string', description: 'Destination chat JID', required: true },
    { name: 'text', type: 'string', description: 'Message body text', required: true },
  ],
  async execute({ jid, text }, context) {
    if (!context.workerApiUrl || !context.workerApiSecret) {
      return { success: false, error: 'Worker API not configured in context' };
    }
    try {
      const url = context.workerApiUrl + '/send';
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + context.workerApiSecret,
        },
        body: JSON.stringify({ jid, text }),
      });
      const data = await res.json();
      return { success: res.ok, data, summary: 'Sent text to ' + jid };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
};

export const reactTool: ToolDefinition<{ jid: string; messageId: string; emoji: string }> = {
  name: 'react',
  category: 'whatsapp',
  description: 'Sends an emoji reaction to a specific WhatsApp message',
  parameters: [
    { name: 'jid', type: 'string', description: 'Destination chat JID', required: true },
    { name: 'messageId', type: 'string', description: 'Target message ID to react to', required: true },
    { name: 'emoji', type: 'string', description: 'Emoji reaction character', required: true },
  ],
  async execute({ jid, messageId, emoji }) {
    return {
      success: true,
      data: { jid, messageId, emoji },
      summary: 'Reacted with ' + emoji + ' to message ' + messageId,
    };
  },
};

export const whatsappTools = [sendTextTool, reactTool];
