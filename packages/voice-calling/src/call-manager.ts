import { EventEmitter } from "events";
import {
  CallEndReason,
  CallMetrics,
  CallPolicy,
  IncomingCall,
} from "./types.js";
import { WhatsAppCallTransport } from "./transport/transport-interface.js";
import { CallPolicyManager, DEFAULT_CALL_POLICY } from "./safety/policy.js";
import { CallRateLimiter } from "./safety/rate-limit.js";
import { CallConsentManager } from "./safety/consent.js";
import { CallAuditLogger } from "./observability/call-logger.js";
import { CallSession } from "./call-session.js";
import { CallTranscriptionEngine } from "./speech/transcription.js";
import { VoiceProvider } from "./tts/provider.js";
import { CallResponseEngine } from "./intelligence/response.js";

export interface VoiceCallManagerOptions {
  transport: WhatsAppCallTransport;
  policy?: Partial<CallPolicy>;
  asrEngine?: CallTranscriptionEngine;
  ttsProvider?: VoiceProvider;
  responseEngine?: CallResponseEngine;
  auditLogger?: CallAuditLogger;
  rateLimiter?: CallRateLimiter;
}

export class VoiceCallManager extends EventEmitter {
  private readonly transport: WhatsAppCallTransport;
  private readonly policyManager: CallPolicyManager;
  private readonly rateLimiter: CallRateLimiter;
  private readonly consentManager: CallConsentManager;
  private readonly auditLogger: CallAuditLogger;

  private readonly asrEngine?: CallTranscriptionEngine;
  private readonly ttsProvider?: VoiceProvider;
  private readonly responseEngine?: CallResponseEngine;

  private readonly activeSessions = new Map<string, CallSession>();
  private isDestroyed = false;

  constructor(options: VoiceCallManagerOptions) {
    super();
    this.transport = options.transport;
    this.policyManager = new CallPolicyManager(options.policy);
    this.rateLimiter = options.rateLimiter ?? new CallRateLimiter({
      maxCallsPerHour: 5,
      cooldownSeconds: 30,
      maxConcurrentCalls: options.policy?.maxConcurrentCalls ?? DEFAULT_CALL_POLICY.maxConcurrentCalls,
    });
    this.consentManager = new CallConsentManager(this.policyManager.getPolicy().aiDisclosure);
    this.auditLogger = options.auditLogger ?? new CallAuditLogger();

    this.asrEngine = options.asrEngine;
    this.ttsProvider = options.ttsProvider;
    this.responseEngine = options.responseEngine;

    // Attach to incoming call transport event
    this.transport.onIncomingCall(async (call) => {
      await this.handleIncomingCall(call);
    });
  }

  public getPolicy(): CallPolicy {
    return this.policyManager.getPolicy();
  }

  public updatePolicy(partial: Partial<CallPolicy>): void {
    this.policyManager.updatePolicy(partial);
  }

  public getAuditLogger(): CallAuditLogger {
    return this.auditLogger;
  }

  public getRateLimiter(): CallRateLimiter {
    return this.rateLimiter;
  }

  public getActiveSessions(): CallSession[] {
    return Array.from(this.activeSessions.values());
  }

  public getActiveSession(callId: string): CallSession | undefined {
    return this.activeSessions.get(callId);
  }

  /**
   * Evaluates inbound call against policy, consent, and rate limiter.
   * If allowed, answers and spawns CallSession; otherwise rejects.
   */
  public async handleIncomingCall(call: IncomingCall): Promise<void> {
    if (this.isDestroyed) return;

    console.log(`[VoiceCallManager] Incoming call ${call.callId} from ${call.callerPhone}`);
    this.emit("incomingCall", call);

    // 1. Evaluate call policy
    const policyResult = this.policyManager.evaluateInboundCall(call, this.activeSessions.size);
    if (policyResult.decision !== "ANSWER") {
      console.log(`[VoiceCallManager] Call rejected by policy: ${policyResult.reason}`);
      await this.transport.reject(call.callId, policyResult.reason);
      
      this.recordRejectedCall(call, "POLICY_BLOCKED", policyResult.reason);
      this.emit("callRejected", { call, reason: policyResult.reason });
      return;
    }

    // 2. Check rate limit & concurrency guard
    const rateResult = this.rateLimiter.checkLimit(call.callerJid);
    if (!rateResult.allowed) {
      console.log(`[VoiceCallManager] Call rejected by rate limiter: ${rateResult.reason}`);
      await this.transport.reject(call.callId, rateResult.reason);

      this.recordRejectedCall(call, "POLICY_BLOCKED", rateResult.reason);
      this.emit("callRejected", { call, reason: rateResult.reason });
      return;
    }

    // 3. Accept and spawn active call session
    const session = new CallSession({
      callId: call.callId,
      callerJid: call.callerJid,
      callerPhone: call.callerPhone,
      callerName: call.callerName,
      transport: this.transport,
      asrEngine: this.asrEngine,
      ttsProvider: this.ttsProvider,
      responseEngine: this.responseEngine,
      policy: this.policyManager.getPolicy(),
      consentManager: this.consentManager,
    });

    this.activeSessions.set(call.callId, session);
    this.rateLimiter.recordCallStart(call.callId, call.callerJid);

    // Bubble session events
    session.on("stateChange", (evt) => {
      this.emit("sessionStateChange", { callId: call.callId, ...evt });
    });

    session.on("turn", (turn) => {
      this.emit("sessionTurn", { callId: call.callId, turn });
    });

    session.on("bargeIn", () => {
      this.emit("sessionBargeIn", { callId: call.callId });
    });

    session.on("ended", (metrics: CallMetrics) => {
      this.activeSessions.delete(call.callId);
      this.rateLimiter.recordCallEnd(call.callId, call.callerJid);
      this.auditLogger.recordCall(metrics);
      this.emit("callEnded", metrics);
    });

    try {
      await this.transport.answer(call.callId);
      await session.start();
      this.emit("callStarted", session);
    } catch (err) {
      console.error(`[VoiceCallManager] Failed to start session for ${call.callId}:`, err);
      await session.end("PROVIDER_FAILURE", String(err));
    }
  }

  private recordRejectedCall(call: IncomingCall, endReason: CallEndReason, failureReason?: string): void {
    const metrics: CallMetrics = {
      callId: call.callId,
      callerPhone: call.callerPhone,
      startedAt: call.timestamp,
      endedAt: Date.now(),
      durationMs: 0,
      turns: [],
      bargeInCount: 0,
      latencies: [],
      status: "ENDED",
      endReason,
      failureReason,
      costEstimatedUsd: 0,
    };
    this.auditLogger.recordCall(metrics);
  }

  public async hangupCall(callId: string, reason: CallEndReason = "BOT_HANGUP"): Promise<void> {
    const session = this.activeSessions.get(callId);
    if (session) {
      await session.end(reason);
    } else {
      await this.transport.hangup(callId);
    }
  }

  public async hangupAll(): Promise<void> {
    const hangupPromises = Array.from(this.activeSessions.values()).map((session) =>
      session.end("BOT_HANGUP")
    );
    await Promise.allSettled(hangupPromises);
    this.activeSessions.clear();
  }

  public async destroy(): Promise<void> {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    await this.hangupAll();
    this.rateLimiter.reset();
  }
}
