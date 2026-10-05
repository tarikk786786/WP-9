export type TurnState = "CALLER_SPEAKING" | "BOT_THINKING" | "BOT_SPEAKING";

export interface TurnManagerEvents {
  onBargeIn?: () => void;
  onTurnStateChanged?: (state: TurnState) => void;
}

/**
 * Call Turn Engine
 * Requirement 19: Never allow both parties to speak continuously.
 * Requirement 18: Barge-in / Interruption handling.
 */
export class CallTurnManager {
  private currentState: TurnState = "CALLER_SPEAKING";
  private events: TurnManagerEvents;
  private bargeInCount = 0;

  constructor(events: TurnManagerEvents = {}) {
    this.events = events;
  }

  public getState(): TurnState {
    return this.currentState;
  }

  public getBargeInCount(): number {
    return this.bargeInCount;
  }

  /**
   * Called by VAD when caller speech is detected
   */
  public onCallerSpeechDetected(): void {
    if (this.currentState === "BOT_SPEAKING") {
      // BARGE-IN DETECTED!
      this.bargeInCount++;
      console.log("[CallTurnManager] Caller interrupted bot speech! Triggering barge-in.");
      this.currentState = "CALLER_SPEAKING";
      if (this.events.onBargeIn) {
        this.events.onBargeIn();
      }
      if (this.events.onTurnStateChanged) {
        this.events.onTurnStateChanged("CALLER_SPEAKING");
      }
    } else if (this.currentState !== "CALLER_SPEAKING") {
      this.currentState = "CALLER_SPEAKING";
      if (this.events.onTurnStateChanged) {
        this.events.onTurnStateChanged("CALLER_SPEAKING");
      }
    }
  }

  /**
   * Called when caller finishes speaking and ASR / LLM generation starts
   */
  public onCallerFinished(): void {
    this.currentState = "BOT_THINKING";
    if (this.events.onTurnStateChanged) {
      this.events.onTurnStateChanged("BOT_THINKING");
    }
  }

  /**
   * Called when TTS audio output starts streaming to the caller
   */
  public onBotStartsSpeaking(): void {
    this.currentState = "BOT_SPEAKING";
    if (this.events.onTurnStateChanged) {
      this.events.onTurnStateChanged("BOT_SPEAKING");
    }
  }

  /**
   * Called when bot finished speaking its utterance
   */
  public onBotFinishedSpeaking(): void {
    this.currentState = "CALLER_SPEAKING";
    if (this.events.onTurnStateChanged) {
      this.events.onTurnStateChanged("CALLER_SPEAKING");
    }
  }

  public reset(): void {
    this.currentState = "CALLER_SPEAKING";
    this.bargeInCount = 0;
  }
}
