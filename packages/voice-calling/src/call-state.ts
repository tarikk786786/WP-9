import { EventEmitter } from "events";
import { CallState } from "./types.js";

/**
 * Valid state transitions for the 13-state Call State Machine
 */
const VALID_TRANSITIONS: Record<CallState, readonly CallState[]> = {
  IDLE: ["INCOMING", "RINGING", "FAILED", "ENDED"],
  INCOMING: ["RINGING", "ANSWERING", "ENDING", "ENDED", "FAILED"],
  RINGING: ["ANSWERING", "ENDING", "ENDED", "FAILED"],
  ANSWERING: ["CONNECTED", "ENDING", "ENDED", "FAILED"],
  CONNECTED: ["LISTENING", "THINKING", "SPEAKING", "PAUSED", "ENDING", "ENDED", "FAILED"],
  LISTENING: ["THINKING", "PAUSED", "ENDING", "ENDED", "FAILED"],
  THINKING: ["SPEAKING", "LISTENING", "PAUSED", "ENDING", "ENDED", "FAILED"],
  SPEAKING: ["INTERRUPTED", "LISTENING", "PAUSED", "ENDING", "ENDED", "FAILED"],
  INTERRUPTED: ["LISTENING", "THINKING", "PAUSED", "ENDING", "ENDED", "FAILED"],
  PAUSED: ["CONNECTED", "LISTENING", "ENDING", "ENDED", "FAILED"],
  ENDING: ["ENDED", "FAILED"],
  ENDED: [], // Terminal
  FAILED: ["ENDED"], // Allow transition to ENDED for final cleanup
};

export interface StateChangeEvent {
  from: CallState;
  to: CallState;
  timestamp: number;
  reason?: string;
}

export class CallStateMachine extends EventEmitter {
  private currentState: CallState = "IDLE";
  private readonly history: StateChangeEvent[] = [];

  constructor(initialState: CallState = "IDLE") {
    super();
    this.currentState = initialState;
    this.history.push({
      from: "IDLE",
      to: initialState,
      timestamp: Date.now(),
    });
  }

  public getState(): CallState {
    return this.currentState;
  }

  public canTransitionTo(nextState: CallState): boolean {
    if (this.currentState === nextState) return true;
    const allowed = VALID_TRANSITIONS[this.currentState];
    return allowed ? allowed.includes(nextState) : false;
  }

  public transition(nextState: CallState, reason?: string): boolean {
    if (this.currentState === nextState) {
      return true; // No-op
    }

    if (!this.canTransitionTo(nextState)) {
      const errorMsg = `Illegal call state transition from ${this.currentState} to ${nextState} (reason: ${reason || "none"})`;
      if (this.listenerCount("error") > 0) {
        this.emit("error", new Error(errorMsg));
      }
      return false;
    }

    const previousState = this.currentState;
    this.currentState = nextState;

    const event: StateChangeEvent = {
      from: previousState,
      to: nextState,
      timestamp: Date.now(),
      reason,
    };

    this.history.push(event);
    this.emit("transition", event);
    this.emit(nextState.toLowerCase(), event);

    return true;
  }

  public getHistory(): readonly StateChangeEvent[] {
    return this.history;
  }

  public isTerminal(): boolean {
    return this.currentState === "ENDED" || (this.currentState === "FAILED" && !this.canTransitionTo("ENDED"));
  }
}
