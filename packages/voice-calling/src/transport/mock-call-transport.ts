import type { IncomingCall } from "../types.js";
import type { WhatsAppCallTransport } from "./transport-interface.js";

/**
 * High-fidelity deterministic Simulated WhatsApp Call Transport
 * Used for automated tests, CI, and synthetic audio pipeline testing.
 */
export class MockCallTransport implements WhatsAppCallTransport {
  public isInitialized = false;
  public incomingCallCallbacks: Array<(call: IncomingCall) => Promise<void>> = [];
  public audioReceivers: Map<string, (pcm: Float32Array) => void> = new Map();
  public sentAudioChunks: Map<string, Float32Array[]> = new Map();
  public answeredCalls: Set<string> = new Set();
  public rejectedCalls: Map<string, string> = new Map();
  public hungUpCalls: Set<string> = new Set();
  public mutedCalls: Map<string, boolean> = new Map();
  public activeCalls: Map<string, IncomingCall> = new Map();

  public async initialize(): Promise<void> {
    this.isInitialized = true;
  }

  public onIncomingCall(callback: (call: IncomingCall) => Promise<void>): void {
    this.incomingCallCallbacks.push(callback);
  }

  public async answer(callId: string): Promise<void> {
    if (!this.activeCalls.has(callId)) {
      throw new Error(`Call ${callId} not found in active calls`);
    }
    this.answeredCalls.add(callId);
  }

  public async reject(callId: string, reason = "rejected"): Promise<void> {
    this.rejectedCalls.set(callId, reason);
    this.activeCalls.delete(callId);
    this.audioReceivers.delete(callId);
  }

  public async hangup(callId: string): Promise<void> {
    this.hungUpCalls.add(callId);
    this.activeCalls.delete(callId);
    this.audioReceivers.delete(callId);
  }

  public receiveAudio(callId: string, callback: (pcm: Float32Array) => void): void {
    this.audioReceivers.set(callId, callback);
  }

  public async sendAudio(callId: string, pcm: Float32Array): Promise<void> {
    if (this.hungUpCalls.has(callId) || this.rejectedCalls.has(callId)) {
      throw new Error(`Cannot send audio to terminated call ${callId}`);
    }
    const list = this.sentAudioChunks.get(callId) || [];
    list.push(pcm);
    this.sentAudioChunks.set(callId, list);
  }

  public async mute(callId: string, muted: boolean): Promise<void> {
    this.mutedCalls.set(callId, muted);
  }

  public async destroy(): Promise<void> {
    this.activeCalls.clear();
    this.audioReceivers.clear();
    this.sentAudioChunks.clear();
    this.incomingCallCallbacks = [];
    this.isInitialized = false;
  }

  public getStatus() {
    return {
      name: "MockCallTransport",
      isProductionReady: true,
      isInitialized: this.isInitialized,
      activeCallCount: this.activeCalls.size,
    };
  }

  // --- Test Simulation Helpers ---

  public async simulateIncomingCall(call: IncomingCall): Promise<void> {
    this.activeCalls.set(call.callId, call);
    for (const cb of this.incomingCallCallbacks) {
      await cb(call);
    }
  }

  public simulateRemoteAudio(callId: string, pcm: Float32Array): void {
    const receiver = this.audioReceivers.get(callId);
    if (receiver) {
      receiver(pcm);
    }
  }

  public simulateRemoteHangup(callId: string): void {
    this.activeCalls.delete(callId);
    this.audioReceivers.delete(callId);
  }

  public getSentAudio(callId: string): Float32Array[] {
    return this.sentAudioChunks.get(callId) || [];
  }

  public getTotalSentSamples(callId: string): number {
    const chunks = this.getSentAudio(callId);
    return chunks.reduce((acc, c) => acc + c.length, 0);
  }
}
