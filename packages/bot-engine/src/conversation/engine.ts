import { eventGate, type EventGate } from "./event-gate/index.ts";
import {
  turnBuilder,
  type ConversationTurnBuilder,
  type ConversationTurn,
  type InboundMessageFragment,
} from "./turn-builder/index.ts";
import {
  understandingEngine,
  type UnderstandingEngine,
  type UnderstandingResult,
  type ConversationHistoryEntry,
} from "./understanding/index.ts";
import {
  responsePlanner,
  qualityGate,
  responseCommit,
  type ResponsePlanner,
  type QualityGate,
  type ResponseCommitManager,
  type CommittedResponse,
} from "./response/index.ts";
import { idempotentOutbox, type IdempotentOutbox, type OutboundSender } from "./outbox/index.ts";

export interface ConversationEngineDependencies {
  eventGate?: EventGate;
  turnBuilder?: ConversationTurnBuilder;
  understandingEngine?: UnderstandingEngine;
  responsePlanner?: ResponsePlanner;
  qualityGate?: QualityGate;
  responseCommit?: ResponseCommitManager;
  outbox?: IdempotentOutbox;
  getSettings?: () => Promise<{ enabled: boolean; aiEnabled?: boolean; [key: string]: unknown }>;
  getConversationStatus?: (chatId: string) => Promise<string>;
  setConversationStatus?: (chatId: string, status: string) => Promise<void>;
  getHistory?: (chatId: string) => Promise<ConversationHistoryEntry[]>;
  searchKnowledge?: (query: string) => Promise<string[]>;
  getFaqs?: () => Promise<Array<{ question: string; answer: string }>>;
  getRules?: () => Promise<Array<{ triggerValue: string; response: string }>>;
  executeTool?: (name: string, args: Record<string, unknown>) => Promise<string | null>;
  generateAiReply?: (
    turn: ConversationTurn,
    understanding: UnderstandingResult,
    context: { history: ConversationHistoryEntry[]; knowledge: string[] }
  ) => Promise<string | null>;
  onMessageCommitted?: (chatId: string, message: CommittedResponse, turn?: ConversationTurn) => Promise<void>;
}

export class AuthoritativeConversationEngine {
  public readonly eventGate: EventGate;
  public readonly turnBuilder: ConversationTurnBuilder;
  public readonly understandingEngine: UnderstandingEngine;
  public readonly responsePlanner: ResponsePlanner;
  public readonly qualityGate: QualityGate;
  public readonly responseCommit: ResponseCommitManager;
  public readonly outbox: IdempotentOutbox;

  private deps: ConversationEngineDependencies;

  constructor(deps: ConversationEngineDependencies = {}) {
    this.deps = deps;
    this.eventGate = deps.eventGate ?? eventGate;
    this.turnBuilder = deps.turnBuilder ?? turnBuilder;
    this.understandingEngine = deps.understandingEngine ?? understandingEngine;
    this.responsePlanner = deps.responsePlanner ?? responsePlanner;
    this.qualityGate = deps.qualityGate ?? qualityGate;
    this.responseCommit = deps.responseCommit ?? responseCommit;
    this.outbox = deps.outbox ?? idempotentOutbox;

    // Connect TurnBuilder flush to turn processor
    this.turnBuilder.onTurnReady(async (turn) => {
      await this.processTurn(turn);
    });
  }

  public setSender(sender: OutboundSender) {
    this.outbox.setSender(sender);
  }

  public updateDependencies(deps: Partial<ConversationEngineDependencies>) {
    this.deps = { ...this.deps, ...deps };
  }

  /**
   * Stage 1: Ingest raw inbound message event into Authoritative Pipeline.
   * Deduplicates by tenantId + chatId + messageId.
   */
  public acceptInboundEvent(event: InboundMessageFragment): { accepted: boolean; reason?: string } {
    const isNew = this.eventGate.acceptEvent(event.tenantId, event.chatId, event.messageId);
    if (!isNew) {
      return { accepted: false, reason: "duplicate_or_in_flight" };
    }

    // Pass to TurnBuilder for burst aggregation & semantic completeness evaluation
    this.turnBuilder.pushFragment(event);
    return { accepted: true };
  }

  /**
   * Authoritative single-turn processor.
   * Guarantees 0 or 1 outbound response per assembled logical turn.
   */
  public async processTurn(turn: ConversationTurn): Promise<CommittedResponse | null> {
    const { tenantId, chatId, turnId, messageIds } = turn;

    // 1. Single-flight Chat Lock
    const lockId = this.eventGate.acquireChatLock(chatId);
    if (!lockId) {
      console.warn(`[conversation-engine] Chat ${chatId} is locked by another in-flight turn. Buffering.`);
      return null;
    }

    try {
      // 2. Mark fragments as PROCESSING
      for (const mid of messageIds) {
        this.eventGate.markProcessing(tenantId, chatId, mid);
      }

      // 3. System Invariant: Bot Enabled Check
      const settings = this.deps.getSettings ? await this.deps.getSettings() : { enabled: true };
      if (settings.enabled === false) {
        this.markTurnProcessed(tenantId, chatId, messageIds);
        return null;
      }

      // 4. System Invariant: Human Handoff / Conversation Status Check
      const status = this.deps.getConversationStatus
        ? await this.deps.getConversationStatus(chatId)
        : "bot";
      if (status !== "bot") {
        // Conversation is in human, waiting_human, paused, or closed mode. Bot must stay silent.
        this.markTurnProcessed(tenantId, chatId, messageIds);
        return null;
      }

      // 5. Fetch Chat History
      const history = this.deps.getHistory ? await this.deps.getHistory(chatId) : [];

      // 6. Deep Understanding Engine
      const understanding = this.understandingEngine.analyze({
        rawText: turn.combinedText,
        history,
        quoted: turn.quoted,
        isGroup: turn.isGroup,
      });

      // 7. Human Escalation Check
      if (
        /\b(human|agent|operator|admin|real person|insan se baat|executive)\b/i.test(
          understanding.normalizedText
        )
      ) {
        if (this.deps.setConversationStatus) {
          await this.deps.setConversationStatus(chatId, "waiting_human");
        }
        const escalateText = "Aapki request note kar li hai, jald hi humare executive aapse connect karenge.";
        return this.commitAndDeliver(turn, escalateText, false, "human_escalate", understanding, history);
      }

      // 8. Tool Execution & Knowledge Retrieval
      let toolContext = "";
      if (understanding.intents.includes("weather") && this.deps.executeTool) {
        const weather = await this.deps.executeTool("weather", { query: understanding.normalizedText });
        if (weather) toolContext = weather;
      }

      const knowledge = this.deps.searchKnowledge
        ? await this.deps.searchKnowledge(understanding.normalizedText)
        : [];

      // 9. Response Planning
      const plan = this.responsePlanner.plan(understanding, {
        recent: history,
        knowledge,
      });

      // 10. Generate Candidate Text
      let candidateText = "";
      let aiGenerated = false;

      // Handle Ambiguity / Clarification
      if (plan.action === "clarification") {
        candidateText = "Aapko konse package ya plan ke baare mein janna hai — Starter ya Premium?";
      } else if (plan.action === "repair_acknowledgment") {
        candidateText = "Acha maaf kijiye, galat samajh gaya tha! " +
          (understanding.repairDetails?.correction || understanding.normalizedText) +
          " ke baare mein batata hoon.";
      } else if (plan.action === "empathy_and_support") {
        candidateText = "Arre yaar, pareshaan mat ho! Sab theek ho jayega, batao main kya madad kar sakta hoon?";
      } else if (toolContext) {
        candidateText = toolContext;
      } else if (this.deps.generateAiReply && settings.aiEnabled !== false) {
        const ai = await this.deps.generateAiReply(turn, understanding, { history, knowledge });
        if (ai) {
          candidateText = ai;
          aiGenerated = true;
        }
      }

      if (!candidateText) {
        // Natural default fallback matching understanding
        if (understanding.primaryIntent === "greeting") {
          candidateText = "Hey! Kaise hain aap? Bataiye main aapki kya madad kar sakta hoon?";
        } else if (understanding.primaryIntent === "pricing") {
          candidateText = understanding.entities.referencedSubject
            ? `${understanding.entities.referencedSubject} ka basic pricing ₹999 se start hota hai.`
            : "Humare pricing plans ₹499 se start hote hain. Aapko kis service ke liye chahiye?";
        } else if (understanding.primaryIntent === "meeting_availability") {
          candidateText = "Haan bilkul, kal milte hain. Kitne baje theek rahega?";
        } else {
          candidateText = "Ji samajh gaya. Iske baare mein aapko aur jankari chahiye toh batayein.";
        }
      }

      // 11. Quality Gate Check
      const quality = this.qualityGate.sanitize(candidateText, history);
      const finalText = quality.sanitizedText;

      // 12. Response Commit & Outbox Delivery
      return this.commitAndDeliver(turn, finalText, aiGenerated, understanding.primaryIntent, understanding, history, plan);
    } finally {
      // Release single-flight chat lock
      this.eventGate.releaseChatLock(chatId, lockId);
    }
  }

  private async commitAndDeliver(
    turn: ConversationTurn,
    text: string,
    aiGenerated: boolean,
    intent: string,
    understanding: UnderstandingResult,
    history: ConversationHistoryEntry[],
    explicitPlan?: ReturnType<ResponsePlanner["plan"]>
  ): Promise<CommittedResponse> {
    const plan = explicitPlan ?? this.responsePlanner.plan(understanding, { recent: history });

    // Commit strictly once per turn
    const { response, isDuplicateAttempt } = this.responseCommit.commitResponse({
      turnId: turn.turnId,
      tenantId: turn.tenantId,
      chatId: turn.chatId,
      text,
      aiGenerated,
      intent,
      plan,
    });

    if (!isDuplicateAttempt) {
      // Enqueue in Idempotent Outbox
      this.outbox.enqueue({
        tenantId: turn.tenantId,
        chatId: turn.chatId,
        responseId: response.responseId,
        text: response.text,
        metadata: {
          turnId: turn.turnId,
          intent,
          aiGenerated,
        },
      });

      if (this.deps.onMessageCommitted) {
        try {
          await this.deps.onMessageCommitted(turn.chatId, response, turn);
        } catch (err) {
          console.error(`[conversation-engine] Error in onMessageCommitted for ${turn.chatId}:`, err);
        }
      }
    }

    // Mark fragments PROCESSED
    this.markTurnProcessed(turn.tenantId, turn.chatId, turn.messageIds);
    return response;
  }

  private markTurnProcessed(tenantId: string, chatId: string, messageIds: string[]) {
    for (const mid of messageIds) {
      this.eventGate.markProcessed(tenantId, chatId, mid);
    }
  }
}

export const conversationEngine = new AuthoritativeConversationEngine();
