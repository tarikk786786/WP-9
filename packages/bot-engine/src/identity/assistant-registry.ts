import {
  CANONICAL_ASSISTANT_ID,
  type AssistantDefinition,
  type AssistantCapability,
  CURRENT_RELEASE_MANIFEST,
} from "@bot/shared";

export class AssistantRegistry {
  private static instance: AssistantRegistry | null = null;
  private definition: AssistantDefinition;

  private constructor() {
    const assistantId = process.env.ASSISTANT_ID || CANONICAL_ASSISTANT_ID;
    this.definition = {
      assistantId,
      name: "WP-9 AI Assistant",
      status: "active",
      version: CURRENT_RELEASE_MANIFEST.workerVersion,
      description: "Authoritative WhatsApp AI Assistant Platform for Tarik Islam / Dezo.in",
      capabilities: [
        "whatsapp_messaging",
        "voice_calling",
        "multimodal_vision",
        "multimodal_audio",
        "tool_execution",
        "web_intelligence",
        "long_term_memory",
        "human_handoff",
        "proactive_automation",
      ],
      defaultLanguage: "hinglish",
      releaseId: CURRENT_RELEASE_MANIFEST.releaseId,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: new Date().toISOString(),
    };
  }

  public static getInstance(): AssistantRegistry {
    if (!AssistantRegistry.instance) {
      AssistantRegistry.instance = new AssistantRegistry();
    }
    return AssistantRegistry.instance;
  }

  public getAssistantId(): string {
    return this.definition.assistantId;
  }

  public getDefinition(): AssistantDefinition {
    return { ...this.definition };
  }

  public hasCapability(capability: AssistantCapability): boolean {
    return this.definition.capabilities.includes(capability);
  }

  public updateStatus(status: AssistantDefinition["status"]): void {
    this.definition.status = status;
    this.definition.updatedAt = new Date().toISOString();
  }
}

export const assistantRegistry = AssistantRegistry.getInstance();
