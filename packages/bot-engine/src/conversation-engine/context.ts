import type { AutomationRule, Faq } from "@bot/shared";
import type { UnderstandingResult } from "./understanding.ts";
import type { ConversationTurn } from "./turn-builder.ts";

export interface ConversationHistoryEntry {
  role: "user" | "assistant";
  text: string;
}

export interface CanonicalContext {
  turn: ConversationTurn;
  understanding: UnderstandingResult;
  history: ConversationHistoryEntry[];
  settings: { enabled: boolean; aiEnabled?: boolean; [key: string]: unknown };
  status: string;
  knowledge: string[];
  faqs: Faq[];
  rules: AutomationRule[];
  referencedEntity?: string;
  lastTopic?: string;
}

export class CanonicalContextBuilder {
  /**
   * Resolves reference words like "ye", "woh", "uska", "iska", "delivery?", "haan", "nahi"
   */
  public resolveReferences(
    normalizedText: string,
    history: ConversationHistoryEntry[],
    quotedText?: string
  ): { resolvedEntity?: string; resolvedText: string } {
    let referencedEntity: string | undefined;

    // Scan recent assistant and user messages for subjects/products
    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i].text;
      const match = msg.match(/\b(Premium Plan|Starter Plan|Basic Plan|Website Design|SEO Service|Hosting|X)\b/i);
      if (match) {
        referencedEntity = match[0];
        break;
      }
      // Check for price mentioned
      if (/\b₹?\d+(\s*se\s*start|\s*ka|\s*rs)/i.test(msg)) {
        referencedEntity = msg.slice(0, 40);
        break;
      }
    }

    if (!referencedEntity && quotedText) {
      referencedEntity = quotedText.slice(0, 50);
    }

    let resolvedText = normalizedText;
    const pronounRegex = /\b(ye|woh|iska|uska|same one|kal wala|that|this)\b/i;
    if (referencedEntity && pronounRegex.test(normalizedText)) {
      resolvedText = `${normalizedText} [referring to: ${referencedEntity}]`;
    }

    // Follow-up single-word queries like "delivery?" or "rate?"
    if (referencedEntity && /^(delivery|rate|shipping|price)\??$/i.test(normalizedText.trim())) {
      resolvedText = `${normalizedText} for ${referencedEntity}`;
    }

    // "Haan" or "Yes" after question
    if (/^(haan|hn|yes|sahi hai|theek hai)$/i.test(normalizedText.trim())) {
      const lastAssistantMsg = history.filter((h) => h.role === "assistant").pop()?.text;
      if (lastAssistantMsg) {
        resolvedText = `User confirms "${normalizedText}" to previous query: "${lastAssistantMsg}"`;
      }
    }

    return { resolvedEntity: referencedEntity, resolvedText };
  }

  public build(params: {
    turn: ConversationTurn;
    understanding: UnderstandingResult;
    history: ConversationHistoryEntry[];
    settings: { enabled: boolean; aiEnabled?: boolean; [key: string]: unknown };
    status: string;
    knowledge?: string[];
    faqs?: Faq[];
    rules?: AutomationRule[];
  }): CanonicalContext {
    const { resolvedEntity, resolvedText } = this.resolveReferences(
      params.understanding.normalizedText,
      params.history,
      params.turn.quoted?.text
    );

    if (resolvedEntity) {
      params.understanding.entities.referencedSubject = resolvedEntity;
      params.understanding.resolvedPronouns["subject"] = resolvedEntity;
    }
    params.understanding.normalizedText = resolvedText;

    return {
      turn: params.turn,
      understanding: params.understanding,
      history: params.history,
      settings: params.settings,
      status: params.status,
      knowledge: params.knowledge ?? [],
      faqs: params.faqs ?? [],
      rules: params.rules ?? [],
      referencedEntity: resolvedEntity,
    };
  }
}

export const contextBuilder = new CanonicalContextBuilder();
