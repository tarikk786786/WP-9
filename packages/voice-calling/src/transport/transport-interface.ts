import type { IncomingCall } from "../types.js";

/**
 * Universal Transport Abstraction for WhatsApp Calling
 * Insulates the rest of WP-9 from low-level VoIP protocol specifics.
 */
export interface WhatsAppCallTransport {
  initialize(): Promise<void>;

  onIncomingCall(
    callback: (call: IncomingCall) => Promise<void>
  ): void;

  answer(callId: string): Promise<void>;

  reject(callId: string, reason?: string): Promise<void>;

  hangup(callId: string): Promise<void>;

  receiveAudio(
    callId: string,
    callback: (pcm: Float32Array) => void
  ): void;

  sendAudio(
    callId: string,
    pcm: Float32Array
  ): Promise<void>;

  mute(callId: string, muted: boolean): Promise<void>;

  destroy(): Promise<void>;

  /** Current transport status */
  getStatus(): {
    name: string;
    isProductionReady: boolean;
    isInitialized: boolean;
    activeCallCount: number;
  };
}
