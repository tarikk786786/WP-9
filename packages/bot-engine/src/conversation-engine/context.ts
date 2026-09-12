import type { AutomationRule, Faq } from "@bot/shared";
import type { UnderstandingResult } from "./understanding.ts";
import type { ConversationTurn } from "./turn-builder.ts";
import type { ActiveConversationState } from "./state.ts";
import { isDazyContact } from "./dazy-profile.ts";
import { memoryManager } from "./memory.ts";

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
  isDazy: boolean;
  activeState: ActiveConversationState;
}

export class CanonicalContextBuilder {
  /**
   * Resolves reference words like "ye", "woh", "uska", "iska", "same", "same wala", "upar wala",
   * "neeche wala", "last wala", "first one", "second one", "that", "this", "it", "delivery?", "haan", "nahi"
   */
  public resolveReferences(
    normalizedText: string,
    history: ConversationHistoryEntry[],
    quotedText?: string,
    activeState?: ActiveConversationState
  ): { resolvedEntity?: string; resolvedText: string } {
    const safeHistory = Array.isArray(history) ? history : [];
    let referencedEntity: string | undefined = activeState?.entity;

    // Scan recent assistant and user messages for subjects/products/entities
    for (let i = safeHistory.length - 1; i >= 0; i--) {
      const msg = safeHistory[i]?.text || "";
      const match = msg.match(/\b(Premium Plan|Starter Plan|Basic Plan|Website Design|SEO Service|Hosting|Product X|X)\b/i);
      if (match) {
        referencedEntity = match[0];
        break;
      }
      // Check for price mentioned (e.g. ₹500, ₹999)
      const priceMatch = msg.match(/₹\d+(?:\.\d+)?|\b\d+\s*rs\b/i);
      if (priceMatch) {
        // Look for the subject mentioned before the price
        const subjectMatch = msg.match(/\b([A-Za-z0-9\s_-]+?)\s*(?:ka|ki|ke|price|costs?|is|₹)/i);
        referencedEntity = subjectMatch ? subjectMatch[1].trim() : "previously discussed item";
        break;
      }
    }

    if (!referencedEntity && quotedText) {
      referencedEntity = quotedText.slice(0, 50).trim();
    }

    let resolvedText = normalizedText;
    const pronounRegex = /\b(ye|woh|iska|uska|idhar|udhar|same|same\s+wala|upar\s+wala|neeche\s+wala|last\s+wala|first\s+one|second\s+one|that|this|it|her|him|them)\b/i;
    if (referencedEntity && pronounRegex.test(normalizedText)) {
      resolvedText = `${normalizedText} [referring to: ${referencedEntity}]`;
    }

    // Follow-up single-word queries like "delivery?" or "rate?" or "price?"
    if (referencedEntity && /^(delivery|rate|shipping|price|charges|fees)\??$/i.test(normalizedText.trim())) {
      resolvedText = `${normalizedText} for ${referencedEntity}`;
    }

    // "Haan" / "Nahi" confirmation after question
    if (/^(haan|hn|yes|sahi hai|theek hai)$/i.test(normalizedText.trim())) {
      const lastAssistantMsg = safeHistory.filter((h) => h.role === "assistant").pop()?.text;
      if (lastAssistantMsg) {
        resolvedText = `User confirms "haan" to previous context: "${lastAssistantMsg}"`;
      }
    } else if (/^(nahi|na|no|nahi yaar)$/i.test(normalizedText.trim())) {
      const lastAssistantMsg = safeHistory.filter((h) => h.role === "assistant").pop()?.text;
      if (lastAssistantMsg) {
        resolvedText = `User declines or clarifies "nahi" to previous context: "${lastAssistantMsg}"`;
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
    const activeState = memoryManager.getActiveState(params.turn.chatId);

    const { resolvedEntity, resolvedText } = this.resolveReferences(
      params.understanding.normalizedText,
      params.history,
      params.turn.quoted?.text,
      activeState
    );

    if (resolvedEntity) {
      params.understanding.entities.referencedSubject = resolvedEntity;
      params.understanding.resolvedPronouns["subject"] = resolvedEntity;
      activeState.entity = resolvedEntity;
    }
    params.understanding.normalizedText = resolvedText;

    // Determine if DAZY
    const isDazy = isDazyContact(params.turn.chatId, params.turn.sender, params.turn.fromName);

    // Update active conversation state
    activeState.topic = params.understanding.primaryIntent;
    activeState.lastIntent = params.understanding.primaryIntent;
    activeState.emotionTrend = params.understanding.emotion;
    activeState.lastSpokenAt = Date.now();

    if (params.understanding.isRepair && params.understanding.repairDetails?.correction) {
      activeState.lastCorrection = params.understanding.repairDetails.correction;
    }

    params.turn.conversationState = activeState;
    params.turn.emotion = params.understanding.emotionState;
    params.turn.intent = params.understanding.primaryIntent;
    params.turn.language = params.understanding.detectedLanguage;
    params.turn.goal = params.understanding.userGoal;
    params.turn.normalizedText = resolvedText;

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
      lastTopic: activeState.topic,
      isDazy,
      activeState,
    };
  }
}

export const contextBuilder = new CanonicalContextBuilder();
