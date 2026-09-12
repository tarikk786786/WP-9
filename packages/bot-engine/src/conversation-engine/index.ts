import type { AutomationRule, Faq } from "@bot/shared";
import {
  recordNoReplyCommit,
  updateInboundClaimStatus,
  claimInboundEvent,
  getStuckConversationsDb,
} from "@bot/database";
import { MultiLayerDeduplicator, deduplicator } from "./deduplicator.ts";
import { EventGate, eventGate, type InboundEventPayload } from "./event-gate.ts";
import { ConversationTurnBuilder, turnBuilder, type ConversationTurn } from "./turn-builder.ts";
import { ConversationLockManager, conversationLock } from "./conversation-lock.ts";
import { UnderstandingEngine, understandingEngine, type UnderstandingResult } from "./understanding.ts";
import { CanonicalContextBuilder, contextBuilder, type CanonicalContext, type ConversationHistoryEntry } from "./context.ts";
import { DecisionEngine, decisionEngine, type DecisionResult } from "./decision.ts";
import { ToolRunner, toolRunner, type ToolExecutor } from "./tool-runner.ts";
import { ModelRouter, modelRouter, type AiGenerator } from "./model-router.ts";
import { ResponsePlanner, responsePlanner, type ResponsePlan } from "./response-planner.ts";
import { ResponseQualityGate, qualityGate } from "./quality-gate.ts";
import { ResponseCommitManager, responseCommitManager, type CommittedResponse } from "./response-commit.ts";
import { WhatsAppOutbox, whatsAppOutbox, type OutboundSender } from "./outbox.ts";
import { brainTelemetry, type TurnTrace, type TurnSpan } from "./telemetry.ts";

export * from "./deduplicator.ts";
export * from "./event-gate.ts";
export * from "./turn-builder.ts";
export * from "./conversation-lock.ts";
export * from "./understanding.ts";
export * from "./context.ts";
export * from "./decision.ts";
export * from "./tool-runner.ts";
export * from "./model-router.ts";
export * from "./response-planner.ts";
export * from "./quality-gate.ts";
export * from "./response-commit.ts";
export * from "./outbox.ts";
export * from "./state.ts";
export * from "./dazy-profile.ts";
export * from "./memory.ts";
export * from "./telemetry.ts";

export interface ConversationEngineMetrics {
  messages_received: number;
  messages_claimed: number;
  messages_duplicate: number;
  messages_finalized: number;
  logical_turns: number;
  reply_required: number;
  no_reply: number;
  generation_success: number;
  generation_failure: number;
  responses_generated: number;
  responses_committed: number;
  responses_sent: number;
  responses_suppressed: number;
  duplicate_response_attempts: number;
  fallback_attempts: number;
  model_failovers: number;
  lock_conflicts: number;
  send_retries: number;
  send_failures: number;
  stuck_turns_recovered: number;
  missing_reply_recovery: number;
  reply_success_rate: number;
  multiple_response_rate: number;
  stuck_turn_rate: number;
}

export interface EngineDependencies {
  deduplicator?: MultiLayerDeduplicator;
  eventGate?: EventGate;
  turnBuilder?: ConversationTurnBuilder;
  conversationLock?: ConversationLockManager;
  understandingEngine?: UnderstandingEngine;
  contextBuilder?: CanonicalContextBuilder;
  decisionEngine?: DecisionEngine;
  toolRunner?: ToolRunner;
  modelRouter?: ModelRouter;
  responsePlanner?: ResponsePlanner;
  qualityGate?: ResponseQualityGate;
  responseCommit?: ResponseCommitManager;
  outbox?: WhatsAppOutbox;

  getSettings?: () => Promise<{ enabled: boolean; aiEnabled?: boolean; [key: string]: unknown }>;
  getConversationStatus?: (chatId: string) => Promise<string>;
  setConversationStatus?: (chatId: string, status: string) => Promise<void>;
  getHistory?: (chatId: string) => Promise<ConversationHistoryEntry[]>;
  searchKnowledge?: (query: string) => Promise<string[]>;
  getFaqs?: () => Promise<Faq[]>;
  getRules?: () => Promise<AutomationRule[]>;
  onMessageCommitted?: (chatId: string, message: CommittedResponse, turn?: ConversationTurn) => Promise<void>;
}

export class AuthoritativeConversationEngine {
  public readonly deduplicator: MultiLayerDeduplicator;
  public readonly eventGate: EventGate;
  public readonly turnBuilder: ConversationTurnBuilder;
  public readonly conversationLock: ConversationLockManager;
  public readonly understandingEngine: UnderstandingEngine;
  public readonly contextBuilder: CanonicalContextBuilder;
  public readonly decisionEngine: DecisionEngine;
  public readonly toolRunner: ToolRunner;
  public readonly modelRouter: ModelRouter;
  public readonly responsePlanner: ResponsePlanner;
  public readonly qualityGate: ResponseQualityGate;
  public readonly responseCommit: ResponseCommitManager;
  public readonly outbox: WhatsAppOutbox;

  private deps: EngineDependencies;
  private metrics: ConversationEngineMetrics = {
    messages_received: 0,
    messages_claimed: 0,
    messages_duplicate: 0,
    messages_finalized: 0,
    logical_turns: 0,
    reply_required: 0,
    no_reply: 0,
    generation_success: 0,
    generation_failure: 0,
    responses_generated: 0,
    responses_committed: 0,
    responses_sent: 0,
    responses_suppressed: 0,
    duplicate_response_attempts: 0,
    fallback_attempts: 0,
    model_failovers: 0,
    lock_conflicts: 0,
    send_retries: 0,
    send_failures: 0,
    stuck_turns_recovered: 0,
    missing_reply_recovery: 0,
    reply_success_rate: 100,
    multiple_response_rate: 0,
    stuck_turn_rate: 0,
  };

  constructor(deps: EngineDependencies = {}) {
    this.deps = deps;
    this.deduplicator = deps.deduplicator ?? deduplicator;
    this.eventGate = deps.eventGate ?? eventGate;
    this.turnBuilder = deps.turnBuilder ?? turnBuilder;
    this.conversationLock = deps.conversationLock ?? conversationLock;
    this.understandingEngine = deps.understandingEngine ?? understandingEngine;
    this.contextBuilder = deps.contextBuilder ?? contextBuilder;
    this.decisionEngine = deps.decisionEngine ?? decisionEngine;
    this.toolRunner = deps.toolRunner ?? toolRunner;
    this.modelRouter = deps.modelRouter ?? modelRouter;
    this.responsePlanner = deps.responsePlanner ?? responsePlanner;
    this.qualityGate = deps.qualityGate ?? qualityGate;
    this.responseCommit = deps.responseCommit ?? responseCommitManager;
    this.outbox = deps.outbox ?? whatsAppOutbox;

    // Connect Turn Ready handler to Authoritative Processing Pipeline
    this.turnBuilder.onTurnReady((turn) => {
      void this.processTurn(turn);
    });
  }

  public setSender(sender: OutboundSender) {
    this.outbox.setSender(sender);
  }

  public setAiGenerator(generator: AiGenerator) {
    this.modelRouter.setAiGenerator(generator);
  }

  public setToolExecutor(executor: ToolExecutor) {
    this.toolRunner.setExecutor(executor);
  }

  public updateDependencies(deps: Partial<EngineDependencies>) {
    this.deps = { ...this.deps, ...deps };
  }

  public getMetrics(): ConversationEngineMetrics {
    const totalCommitted = this.metrics.responses_committed;
    const dupAttempts = this.metrics.duplicate_response_attempts;
    this.metrics.multiple_response_rate = totalCommitted > 0 ? (dupAttempts / totalCommitted) * 100 : 0;
    const replyReq = this.metrics.reply_required;
    this.metrics.reply_success_rate = replyReq > 0 ? (totalCommitted / replyReq) * 100 : 100;
    const turns = this.metrics.logical_turns;
    this.metrics.stuck_turn_rate = turns > 0 ? (this.metrics.stuck_turns_recovered / turns) * 100 : 0;
    return { ...this.metrics };
  }

  /**
   * Authoritative Entrypoint for Inbound WhatsApp Messages
   */
  public async acceptInboundEvent(event: InboundEventPayload): Promise<boolean> {
    this.metrics.messages_received += 1;
    console.log(`[trace] MESSAGE_RECEIVED eventId=${event.messageId} chat=${event.chatId}`);

    const result = await this.eventGate.acceptEvent(event);
    if (!result.accepted) {
      this.metrics.messages_duplicate += 1;
      this.metrics.responses_suppressed += 1;
      console.log(`[trace] DEDUPED eventId=${event.messageId} reason=${result.reason}`);
      return false;
    }

    this.metrics.messages_claimed += 1;
    console.log(`[trace] ACCEPTED eventId=${result.eventId} pushing to TurnBuilder`);
    this.turnBuilder.pushFragment(event);
    return true;
  }

  /**
   * Authoritative Pipeline for Logical User Turn
   */
  public async processTurn(turn: ConversationTurn): Promise<CommittedResponse | null> {
    this.metrics.logical_turns += 1;
    console.log(`[trace] TURN_CREATED turnId=${turn.turnId} fragments=${turn.messageIds.length} text="${turn.combinedText.slice(0, 40)}"`);

    // Start Unified Turn Trace
    const trace = brainTelemetry.startTrace({
      turnId: turn.turnId,
      chatId: turn.chatId,
      sender: turn.sender,
      userText: turn.combinedText,
      isDazy: false,
    });

    // 1. Single-Flight Conversation Lock per Chat
    const lockOwner = await this.conversationLock.acquireLock(turn.chatId, turn.turnId);
    if (!lockOwner) {
      this.metrics.lock_conflicts += 1;
      this.metrics.responses_suppressed += 1;
      console.warn(`[trace] LOCK_CONFLICT Chat ${turn.chatId} is locked by active turn in-flight. Dropping turn ${turn.turnId}`);
      return null;
    }
    console.log(`[trace] LOCK_ACQUIRED turnId=${turn.turnId} owner=${lockOwner}`);

    try {
      for (const mid of turn.messageIds) {
        await updateInboundClaimStatus(mid, "DECISION_PENDING", { turnId: turn.turnId });
      }

      // 2. Fetch Dependencies
      const settings = this.deps.getSettings ? await this.deps.getSettings() : { enabled: true, aiEnabled: true };
      const status = this.deps.getConversationStatus ? await this.deps.getConversationStatus(turn.chatId) : "bot";
      const history = this.deps.getHistory ? await this.deps.getHistory(turn.chatId) : [];
      const knowledge = this.deps.searchKnowledge ? await this.deps.searchKnowledge(turn.combinedText) : [];
      const faqs = this.deps.getFaqs ? await this.deps.getFaqs() : [];
      const rules = this.deps.getRules ? await this.deps.getRules() : [];

      // 3. Understanding Engine
      const understanding = this.understandingEngine.analyze({
        rawText: turn.combinedText,
        quoted: turn.quoted,
        history,
      });
      console.log(`[trace] UNDERSTOOD turnId=${turn.turnId} intent=${understanding.primaryIntent} lang=${understanding.detectedLanguage} repair=${understanding.isRepair}`);

      // 4. Canonical Context Builder
      const context = this.contextBuilder.build({
        turn,
        understanding,
        history,
        settings,
        status,
        knowledge,
        faqs,
        rules,
      });

      trace.isDazy = context.isDazy;
      brainTelemetry.recordUnderstanding(turn.turnId, understanding.primaryIntent, understanding.emotion);
      brainTelemetry.recordMemory(turn.turnId, knowledge);

      // 5. Decision Engine
      const decision = this.decisionEngine.evaluate(context);
      console.log(`[trace] DECISION turnId=${turn.turnId} decision=${decision.decision} reason="${decision.reason}"`);

      if (decision.decision === "DO_NOT_REPLY" || decision.decision === "IGNORE" || decision.decision === "DUPLICATE") {
        this.metrics.no_reply += 1;
        this.metrics.messages_finalized += turn.messageIds.length;
        this.metrics.responses_suppressed += 1;
        await recordNoReplyCommit({
          turnId: turn.turnId,
          chatId: turn.chatId,
          reason: decision.reason,
          messageIds: turn.messageIds,
        });
        for (const frag of turn.fragments) {
          const evtId = this.eventGate.generateEventId(frag.tenantId, frag.chatId, frag.messageId);
          this.eventGate.markProcessed(evtId);
        }
        return null;
      }

      if (decision.decision === "ESCALATE") {
        this.metrics.reply_required += 1;
        if (this.deps.setConversationStatus) {
          await this.deps.setConversationStatus(turn.chatId, "waiting_human");
        }
        const escalateText = "Aapki request note kar li hai, jald hi humare executive aapse connect karenge.";
        return await this.commitAndEnqueue(turn, escalateText, "human_escalate", context);
      }

      this.metrics.reply_required += 1;
      for (const mid of turn.messageIds) {
        await updateInboundClaimStatus(mid, "GENERATING", { turnId: turn.turnId, leaseMs: 120_000 });
      }

      // 6. Pre-Commit Candidate Resolution (ModelRouter)
      let candidate;
      try {
        candidate = await this.modelRouter.resolveCandidate(context);
        this.metrics.generation_success += 1;
        this.metrics.responses_generated += 1;
        if (candidate.source === "fallback") this.metrics.fallback_attempts += 1;
        console.log(`[trace] ANSWER_GENERATED turnId=${turn.turnId} source=${candidate.source} timeMs=${candidate.executionTimeMs}`);
      } catch (genErr) {
        this.metrics.generation_failure += 1;
        console.error(`[trace] GENERATION_FAILED turnId=${turn.turnId}:`, genErr);
        candidate = {
          source: "fallback" as const,
          text: "Ji samajh gaya. Iske baare mein aapko aur jankari chahiye toh batayein.",
          confidence: 0.5,
          executionTimeMs: 0,
        };
      }

      // Stale AI result / mid-generation status switch protection
      const liveStatus = this.deps.getConversationStatus ? await this.deps.getConversationStatus(turn.chatId) : "bot";
      const liveSettings = this.deps.getSettings ? await this.deps.getSettings() : { enabled: true };
      if (liveStatus !== "bot" || liveSettings.enabled === false) {
        console.warn(`[trace] CONVERSATION_STATE_CHANGED_DURING_GENERATION turnId=${turn.turnId} status=${liveStatus} enabled=${liveSettings.enabled}. Discarding candidate.`);
        await recordNoReplyCommit({
          turnId: turn.turnId,
          chatId: turn.chatId,
          reason: "STATE_CHANGED_DURING_GENERATION",
          messageIds: turn.messageIds,
        });
        return null;
      }

      brainTelemetry.recordGeneration(turn.turnId, candidate);

      // 7. Response Planning
      const plan = this.responsePlanner.plan(context, candidate);

      // 8. Response Quality Gate (Human Language Quality Engine)
      const qualityAudit = this.qualityGate.audit(plan.answer, history, {
        isDazy: context.isDazy,
        emotionState: context.understanding?.emotionState,
        userLanguage: context.understanding?.detectedLanguage,
        rawUserInput: turn.combinedText,
      });
      brainTelemetry.recordQualityAudit(turn.turnId, qualityAudit);
      const finalText = qualityAudit.sanitizedText;
      console.log(
        `[trace] QUALITY_AUDIT turnId=${turn.turnId} passed=${qualityAudit.passed} humility=${qualityAudit.scores?.humility ?? 100} naturalness=${qualityAudit.scores?.naturalness ?? 100}`
      );

      // 9. Atomic Response Commit (Strict 1 Response per Turn)
      return await this.commitAndEnqueue(turn, finalText, plan.intent, context, plan);
    } finally {
      // Safe Lock Release
      await this.conversationLock.releaseLock(turn.chatId, turn.turnId);
      console.log(`[trace] LOCK_RELEASED turnId=${turn.turnId}`);
    }
  }

  private async commitAndEnqueue(
    turn: ConversationTurn,
    text: string,
    intent: string,
    context: CanonicalContext,
    explicitPlan?: ResponsePlan
  ): Promise<CommittedResponse> {
    const plan =
      explicitPlan ??
      this.responsePlanner.plan(context, {
        source: "fallback",
        text,
        confidence: 1.0,
        executionTimeMs: 0,
      });

    const commitResult = await this.responseCommit.commitResponse({
      turnId: turn.turnId,
      chatId: turn.chatId,
      plan,
      finalText: text,
    });

    if (commitResult.isDuplicateAttempt) {
      this.metrics.duplicate_response_attempts += 1;
      console.error(
        `[CRITICAL_DUPLICATE_RESPONSE] Duplicate commit attempt suppressed for turnId=${turn.turnId}. Reusing responseId=${commitResult.committedResponse.responseId}`
      );
      return commitResult.committedResponse;
    }

    this.metrics.responses_committed += 1;
    this.metrics.messages_finalized += turn.messageIds.length;
    const response = commitResult.committedResponse;
    brainTelemetry.recordCommit(turn.turnId, response.responseId, response.text);
    console.log(`[trace] RESPONSE_COMMITTED turnId=${turn.turnId} responseId=${response.responseId}`);

    for (const mid of turn.messageIds) {
      await updateInboundClaimStatus(mid, "RESPONSE_COMMITTED", { turnId: turn.turnId });
    }

    // Authoritative Outbox Enqueue
    await this.outbox.enqueue({
      responseId: response.responseId,
      turnId: turn.turnId,
      chatId: turn.chatId,
      text: response.text,
      metadata: {
        intent,
        modelId: response.modelId,
      },
    });
    console.log(`[trace] OUTBOX_ENQUEUED responseId=${response.responseId}`);

    for (const mid of turn.messageIds) {
      await updateInboundClaimStatus(mid, "OUTBOX_PENDING", { turnId: turn.turnId });
    }

    // Notify persistence callback
    if (this.deps.onMessageCommitted) {
      try {
        await this.deps.onMessageCommitted(turn.chatId, response, turn);
      } catch (err) {
        console.error(`[conversation-engine] Error in onMessageCommitted for ${turn.chatId}:`, err);
      }
    }

    // Mark fragments PROCESSED in EventGate
    for (const frag of turn.fragments) {
      const evtId = this.eventGate.generateEventId(frag.tenantId, frag.chatId, frag.messageId);
      this.eventGate.markProcessed(evtId);
    }

    return response;
  }

  /**
   * Periodic recovery worker: finds expired claims and pending outbox items and recovers them
   */
  public async recoverStuckConversations(): Promise<{
    recoveredClaims: number;
    recoveredOutbox: number;
  }> {
    try {
      const { stuckClaims, stuckOutbox } = await getStuckConversationsDb();
      let recoveredClaims = 0;
      let recoveredOutbox = 0;

      // 1. Recover stuck outbox items (pending or sending with expired lease)
      if (stuckOutbox.length > 0) {
        for (const item of stuckOutbox) {
          await this.outbox.enqueue({
            responseId: item.responseId,
            turnId: item.turnId,
            chatId: item.chatId,
            text: item.text,
          });
          recoveredOutbox += 1;
        }
        await this.outbox.processQueue(true);
      }

      // 2. Recover stuck claims whose lease expired
      if (stuckClaims.length > 0) {
        for (const claim of stuckClaims) {
          const reclaim = await claimInboundEvent({
            messageId: claim.messageId,
            eventId: claim.eventId,
            chatId: claim.chatId,
            senderId: claim.senderId,
            source: claim.source,
            leaseMs: 120_000,
          });
          if (reclaim.claimed) {
            recoveredClaims += 1;
            this.metrics.stuck_turns_recovered += 1;
            this.metrics.missing_reply_recovery += 1;
            console.log(`[recovery] Recovered stuck message ${claim.messageId} in chat ${claim.chatId}`);
          }
        }
      }

      return { recoveredClaims, recoveredOutbox };
    } catch (err) {
      console.error("[recovery] Error in recoverStuckConversations:", err);
      return { recoveredClaims: 0, recoveredOutbox: 0 };
    }
  }
}

export const conversationEngine = new AuthoritativeConversationEngine();
export const ConversationBrain = AuthoritativeConversationEngine;
export type ConversationBrain = AuthoritativeConversationEngine;
export const conversationBrain = conversationEngine;
