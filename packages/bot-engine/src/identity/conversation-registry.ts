import {
  CANONICAL_ASSISTANT_ID,
  type ConversationRecord,
  type ConversationType,
  type AssistantContext,
} from "@bot/shared";
import { assistantRegistry } from "./assistant-registry.ts";

export class ConversationRegistry {
  private static instance: ConversationRegistry | null = null;
  private conversations: Map<string, ConversationRecord> = new Map();

  private constructor() {}

  public static getInstance(): ConversationRegistry {
    if (!ConversationRegistry.instance) {
      ConversationRegistry.instance = new ConversationRegistry();
    }
    return ConversationRegistry.instance;
  }

  public getOrCreateConversation(params: {
    chatId: string;
    participantId: string;
    channel?: "whatsapp_chat" | "whatsapp_call" | "web_desk" | "simulator";
    type?: ConversationType;
    groupId?: string;
  }): ConversationRecord {
    const existing = this.conversations.get(params.chatId);
    if (existing) {
      return existing;
    }

    const isGroup = params.groupId != null || params.chatId.endsWith("@g.us");
    const inferredType: ConversationType =
      params.type || (isGroup ? "GROUP" : params.channel === "whatsapp_call" ? "CALL" : "DIRECT");

    const record: ConversationRecord = {
      conversationId: `conv_${params.chatId.replace(/[^a-zA-Z0-9_-]/g, "_")}`,
      assistantId: assistantRegistry.getAssistantId(),
      channel: params.channel || "whatsapp_chat",
      type: inferredType,
      participantId: params.participantId,
      groupId: params.groupId || (isGroup ? params.chatId : undefined),
      status: "active",
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.conversations.set(params.chatId, record);
    return record;
  }

  public getConversation(chatId: string): ConversationRecord | undefined {
    return this.conversations.get(chatId);
  }

  public updateStatus(chatId: string, status: ConversationRecord["status"]): void {
    const record = this.conversations.get(chatId);
    if (record) {
      record.status = status;
      record.updatedAt = new Date().toISOString();
    }
  }

  public createAssistantContext(params: {
    chatId: string;
    participantId: string;
    turnId: string;
    traceId?: string;
    requestId?: string;
    channel?: "whatsapp_chat" | "whatsapp_call" | "web_desk" | "simulator";
    toolScope?: string[];
  }): AssistantContext {
    const conv = this.getOrCreateConversation({
      chatId: params.chatId,
      participantId: params.participantId,
      channel: params.channel,
    });

    const isGroup = conv.type === "GROUP";

    return {
      assistantId: conv.assistantId,
      conversationId: conv.conversationId,
      userId: params.participantId,
      contactId: params.participantId,
      groupId: conv.groupId,
      turnId: params.turnId,
      requestId: params.requestId || `req_${Date.now()}`,
      traceId: params.traceId,
      memoryScope: isGroup ? "group" : "contact",
      policyScope: "default",
      toolScope: params.toolScope || [],
      releaseId: assistantRegistry.getDefinition().releaseId,
    };
  }
}

export const conversationRegistry = ConversationRegistry.getInstance();
