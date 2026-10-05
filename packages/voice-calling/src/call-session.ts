import { EventEmitter } from "events";
import {
  CallEndReason,
  CallMetrics,
  CallPolicy,
  CallState,
  SpokenResponseContext,
  VoiceTurn,
} from "./types.js";
import { CallStateMachine } from "./call-state.js";
import { WhatsAppCallTransport } from "./transport/transport-interface.js";
import { InboundAudioStream } from "./audio/inbound-stream.js";
import { OutboundAudioStream } from "./audio/outbound-stream.js";
import { VoiceActivityDetector } from "./speech/vad.js";
import { CallTranscriptionEngine } from "./speech/transcription.js";
import { VoiceProvider } from "./tts/provider.js";
import { SyntheticVoiceProvider } from "./tts/tts-providers.js";
import { CallResponseEngine } from "./intelligence/response.js";
import { CallTurnManager } from "./intelligence/turn-manager.js";
import { ThinkingFillerManager } from "./intelligence/thinking-filler.js";
import { CallMetricsCollector } from "./observability/metrics.js";
import { TurnTracer } from "./observability/tracing.js";
import { CallCleanupManager } from "./recovery/cleanup.js";
import { CallConsentManager } from "./safety/consent.js";

export interface CallSessionOptions {
  callId: string;
  callerJid: string;
  callerPhone: string;
  callerName?: string;
  transport: WhatsAppCallTransport;
  asrEngine?: CallTranscriptionEngine;
  ttsProvider?: VoiceProvider;
  responseEngine?: CallResponseEngine;
  policy: CallPolicy;
  consentManager?: CallConsentManager;
}

export class CallSession extends EventEmitter {
  public readonly callId: string;
  public readonly callerJid: string;
  public readonly callerPhone: string;
  public readonly callerName?: string;
  public readonly policy: CallPolicy;

  private readonly stateMachine: CallStateMachine;
  private readonly transport: WhatsAppCallTransport;
  private readonly asrEngine: CallTranscriptionEngine;
  private readonly ttsProvider: VoiceProvider;
  private readonly responseEngine: CallResponseEngine;
  private readonly consentManager: CallConsentManager;

  private readonly inboundStream: InboundAudioStream;
  private readonly outboundStream: OutboundAudioStream;
  private readonly vad: VoiceActivityDetector;
  private readonly turnManager: CallTurnManager;
  private readonly thinkingFiller: ThinkingFillerManager;
  private readonly metrics: CallMetricsCollector;
  private readonly cleanup: CallCleanupManager;

  private speechBuffer: Float32Array[] = [];
  private silenceTimer?: NodeJS.Timeout;
  private maxDurationTimer?: NodeJS.Timeout;
  private isProcessingTurn = false;
  private consecutiveSilences = 0;

  constructor(options: CallSessionOptions) {
    super();
    this.callId = options.callId;
    this.callerJid = options.callerJid;
    this.callerPhone = options.callerPhone;
    this.callerName = options.callerName;
    this.policy = options.policy;

    this.stateMachine = new CallStateMachine("INCOMING");
    this.transport = options.transport;
    this.asrEngine = options.asrEngine ?? new CallTranscriptionEngine();
    this.ttsProvider = options.ttsProvider ?? new SyntheticVoiceProvider();
    this.responseEngine = options.responseEngine ?? new CallResponseEngine();
    this.consentManager = options.consentManager ?? new CallConsentManager(this.policy.aiDisclosure);

    this.inboundStream = new InboundAudioStream();
    this.outboundStream = new OutboundAudioStream({
      callId: this.callId,
      transport: this.transport,
      onPlaybackFinished: () => {
        this.turnManager.onBotFinishedSpeaking();
        if (this.stateMachine.getState() === "SPEAKING") {
          this.stateMachine.transition("LISTENING", "Bot response playout completed");
        }
        this.resetSilenceWatchdog();
      },
    });

    this.vad = new VoiceActivityDetector({
      silenceTimeoutMs: 500,
    });
    this.turnManager = new CallTurnManager();
    this.thinkingFiller = new ThinkingFillerManager(this.policy.thinkingCooldownMs);
    this.metrics = new CallMetricsCollector(this.callId, this.callerPhone);
    this.cleanup = new CallCleanupManager();

    // Bubble state machine transitions
    this.stateMachine.on("transition", (evt) => {
      this.emit("stateChange", evt);
    });
  }

  public getState(): CallState {
    return this.stateMachine.getState();
  }

  public getMetrics(): CallMetrics {
    return this.metrics.getSnapshot();
  }

  /**
   * Starts the call session: answers the call, connects streams, initializes VAD.
   */
  public async start(): Promise<void> {
    try {
      this.stateMachine.transition("ANSWERING", "Session start");

      // Set frame handler for normalized 20ms frames from inbound stream
      this.inboundStream.setFrameHandler((frame: Float32Array) => {
        this.handleInboundFrame(frame);
      });

      // Receive audio from transport
      this.transport.receiveAudio(this.callId, (pcm: Float32Array) => {
        this.inboundStream.push(pcm);
      });

      // Max duration watchdog
      if (this.policy.maxCallDurationMs > 0) {
        this.maxDurationTimer = setTimeout(() => {
          console.log(`[CallSession] Max call duration reached for ${this.callId}`);
          void this.end("MAX_DURATION");
        }, this.policy.maxCallDurationMs);
        this.cleanup.registerTimer(this.maxDurationTimer);
      }

      this.stateMachine.transition("CONNECTED", "Transport connected");
      this.metrics.markAnswered();

      // Play transparent AI disclosure if configured
      const greeting = this.consentManager.getDisclosureText();
      if (greeting) {
        await this.speak(greeting);
      }

      this.stateMachine.transition("LISTENING", "Awaiting caller input");
      this.resetSilenceWatchdog();
    } catch (err) {
      console.error(`[CallSession] Error starting session ${this.callId}:`, err);
      this.stateMachine.transition("FAILED", String(err));
      await this.end("PROVIDER_FAILURE", String(err));
    }
  }

  private handleInboundFrame(frame: Float32Array): void {
    const event = this.vad.processFrame(frame);

    if (event.type === "speech_start") {
      this.speechBuffer = [frame];
      this.handleCallerSpeechStart();
    } else if (event.type === "speech_continuation") {
      this.speechBuffer.push(frame);
    } else if (event.type === "speech_end") {
      this.speechBuffer.push(frame);
      const totalLength = this.speechBuffer.reduce((acc, f) => acc + f.length, 0);
      const merged = new Float32Array(totalLength);
      let offset = 0;
      for (const f of this.speechBuffer) {
        merged.set(f, offset);
        offset += f.length;
      }
      this.speechBuffer = [];
      void this.handleCallerSpeechEnd(merged);
    }
  }

  /**
   * Handle caller starting to speak: trigger immediate barge-in if bot was speaking/thinking
   */
  private handleCallerSpeechStart(): void {
    this.clearSilenceWatchdog();
    this.turnManager.onCallerSpeechDetected();

    const currentState = this.stateMachine.getState();
    if (currentState === "SPEAKING" || currentState === "THINKING") {
      console.log(`[CallSession] Barge-in detected during ${currentState}! Aborting bot playback.`);
      this.outboundStream.abort();
      this.metrics.recordBargeIn();
      this.stateMachine.transition("INTERRUPTED", "Caller interrupted bot");
      this.stateMachine.transition("LISTENING", "Listening to interruption");
      this.emit("bargeIn");
    }
  }

  /**
   * Handle caller finishing an utterance: ASR -> LLM -> TTS -> Playback
   */
  private async handleCallerSpeechEnd(samples: Float32Array): Promise<void> {
    if (this.isProcessingTurn) return;
    this.isProcessingTurn = true;

    const turnId = `turn_${Date.now()}`;
    const tracer = new TurnTracer(this.callId, turnId);

    try {
      this.stateMachine.transition("THINKING", "Processing caller utterance");
      this.turnManager.onCallerFinished();

      // Step 1: ASR
      tracer.startSpan("asr");
      const asrResult = await this.asrEngine.transcribe(samples);
      tracer.endSpan("asr");

      if (!asrResult.transcript.trim()) {
        this.consecutiveSilences++;
        if (this.consecutiveSilences >= 2) {
          await this.speak("Maaf kijiye, mujhe aapki awaaz theek se nahi aayi. Kya aap dohra sakte hain?");
          this.consecutiveSilences = 0;
        }
        this.stateMachine.transition("LISTENING", "Empty transcript, resumed listening");
        this.resetSilenceWatchdog();
        return;
      }

      this.consecutiveSilences = 0;

      const callerTurn: VoiceTurn = {
        turnId,
        speaker: "caller",
        text: asrResult.transcript,
        language: asrResult.language,
        confidence: asrResult.confidence,
        startedAt: Date.now() - asrResult.durationMs,
        endedAt: Date.now(),
      };
      this.metrics.recordTurn(callerTurn);
      this.emit("turn", callerTurn);

      // Step 2: Spoken Response Generation
      tracer.startSpan("llm");
      const responseContext: SpokenResponseContext = {
        callId: this.callId,
        callerPhone: this.callerPhone,
        callerName: this.callerName,
        turns: [callerTurn],
        currentUtterance: asrResult.transcript,
        detectedLanguage: asrResult.language,
        languageConfidence: asrResult.confidence,
      };

      const spokenResponse = await this.responseEngine.generateResponse(responseContext);
      tracer.endSpan("llm");

      // Step 3: Bot Spoken Output
      const botTurn: VoiceTurn = {
        turnId: `turn_bot_${Date.now()}`,
        speaker: "bot",
        text: spokenResponse.text,
        language: asrResult.language,
        confidence: 1.0,
        startedAt: Date.now(),
      };

      this.stateMachine.transition("SPEAKING", "Synthesizing and streaming voice response");
      this.turnManager.onBotStartsSpeaking();
      tracer.startSpan("tts_first_byte");

      await this.speak(spokenResponse.text, () => {
        tracer.endSpan("tts_first_byte");
      });

      botTurn.endedAt = Date.now();
      this.metrics.recordTurn(botTurn);
      this.metrics.recordLatency(tracer.toLatencyMetrics());
      this.emit("turn", botTurn);
    } catch (err) {
      console.error(`[CallSession] Error during turn processing:`, err);
      if (this.stateMachine.canTransitionTo("LISTENING")) {
        this.stateMachine.transition("LISTENING", "Turn processing recovered");
      }
    } finally {
      this.isProcessingTurn = false;
    }
  }

  /**
   * Synthesizes text and streams frames to outbound transport
   */
  private async speak(text: string, onFirstChunk?: () => void): Promise<void> {
    try {
      let isFirst = true;
      for await (const chunk of this.ttsProvider.synthesizeStream(text, { language: "hi" })) {
        if (isFirst) {
          isFirst = false;
          onFirstChunk?.();
        }
        this.outboundStream.enqueue(chunk);
      }
    } catch (err) {
      console.warn(`[CallSession] Speech output error:`, err);
    }
  }

  private resetSilenceWatchdog(): void {
    this.clearSilenceWatchdog();
    if (this.cleanup.isDone() || this.stateMachine.isTerminal() || this.policy.silenceTimeoutMs <= 0) return;

    this.silenceTimer = setTimeout(() => {
      if (this.cleanup.isDone() || this.stateMachine.isTerminal()) return;
      console.log(`[CallSession] Silence timeout triggered on ${this.callId}`);
      if (this.stateMachine.getState() === "LISTENING") {
        void this.speak("Kya aap sun pa rahe hain?");
      }
    }, this.policy.silenceTimeoutMs);
  }

  private clearSilenceWatchdog(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = undefined;
    }
  }

  /**
   * Gracefully ends the call session
   */
  public async end(reason: CallEndReason = "NORMAL", failureReason?: string): Promise<CallMetrics> {
    this.clearSilenceWatchdog();
    this.stateMachine.transition("ENDING", `Ending call: ${reason}`);

    try {
      this.outboundStream.abort();
      this.vad.reset();
      await this.transport.hangup(this.callId);
    } catch (err) {
      console.warn(`[CallSession] Error during transport hangup:`, err);
    }

    await this.cleanup.cleanup();

    this.stateMachine.transition("ENDED", `Call ended: ${reason}`);
    this.metrics.markEnded(reason, "ENDED", failureReason);

    const finalMetrics = this.metrics.getSnapshot();
    this.emit("ended", finalMetrics);
    return finalMetrics;
  }
}
