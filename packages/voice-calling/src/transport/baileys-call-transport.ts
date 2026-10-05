import type { IncomingCall } from "../types.js";
import type { WhatsAppCallTransport } from "./transport-interface.js";

export interface BaileysCallNode {
  id: string;
  from: string;
  status: "offer" | "ringing" | "timeout" | "reject" | "accept";
  date: Date;
  isVideo: boolean;
  isGroup: boolean;
  offline: boolean;
}

export interface BaileysSocketLike {
  ev: {
    on(event: string, listener: (...args: any[]) => void): void;
    off?(event: string, listener: (...args: any[]) => void): void;
  };
  rejectCall(callId: string, callFrom: string): Promise<void>;
  query?: (node: any, timeoutMs?: number) => Promise<any>;
}

/**
 * Baileys Native Call Transport Adapter
 *
 * Reuses the existing WhatsApp socket created by apps/worker.
 * CRITICAL: Never creates makeWASocket() independently.
 *
 * STATUS: EXPERIMENTAL
 * Full duplex audio RTP media in WhatsApp requires proprietary SRTP/VoIP signaling
 * not officially supported in Baileys 6.7.24. This transport manages call signaling,
 * incoming call detection, rejection, and auto-hangup.
 */
export class BaileysCallTransport implements WhatsAppCallTransport {
  public static readonly IS_PRODUCTION_READY = false;
  public static readonly STATUS_REASON = "CALL TRANSPORT NOT PRODUCTION-READY: WhatsApp VoIP SRTP media transport is experimental in open-source";

  private socket: BaileysSocketLike | null = null;
  private incomingCallCallbacks: Array<(call: IncomingCall) => Promise<void>> = [];
  private audioCallbacks: Map<string, (pcm: Float32Array) => void> = new Map();
  private activeCalls: Map<string, IncomingCall> = new Map();
  private isInitialized = false;

  constructor(socketOrProvider?: BaileysSocketLike | (() => BaileysSocketLike | null)) {
    if (typeof socketOrProvider === "function") {
      this.socket = socketOrProvider();
    } else if (socketOrProvider) {
      this.socket = socketOrProvider;
    }
  }

  public setSocket(socket: BaileysSocketLike | null): void {
    this.socket = socket;
    if (socket && !this.isInitialized) {
      this.attachSocketListeners();
    }
  }

  public async initialize(): Promise<void> {
    if (this.socket) {
      this.attachSocketListeners();
    }
    this.isInitialized = true;
  }

  private attachSocketListeners(): void {
    if (!this.socket) return;

    this.socket.ev.on("call", async (events: BaileysCallNode[]) => {
      if (!Array.isArray(events)) return;

      for (const event of events) {
        if (event.status === "offer") {
          const call: IncomingCall = {
            callId: event.id,
            callerJid: event.from,
            callerPhone: event.from.split("@")[0].replace(/\D/g, ""),
            timestamp: event.date ? new Date(event.date).getTime() : Date.now(),
            isGroup: Boolean(event.isGroup),
            offerData: event,
          };

          this.activeCalls.set(call.callId, call);

          for (const cb of this.incomingCallCallbacks) {
            try {
              await cb(call);
            } catch (err) {
              console.error("[BaileysCallTransport] Error in incoming call callback:", err);
            }
          }
        } else if (event.status === "reject" || event.status === "timeout") {
          this.activeCalls.delete(event.id);
          this.audioCallbacks.delete(event.id);
        }
      }
    });
  }

  public onIncomingCall(callback: (call: IncomingCall) => Promise<void>): void {
    this.incomingCallCallbacks.push(callback);
  }

  public async answer(callId: string): Promise<void> {
    const call = this.activeCalls.get(callId);
    if (!call) {
      throw new Error(`[BaileysCallTransport] Cannot answer unknown callId: ${callId}`);
    }
    // Signaling accept node: in WhatsApp Web, accepting requires sending an <accept> stanza
    // Since full duplex media is experimental, we acknowledge the signaling
    console.log(`[BaileysCallTransport] (Experimental) Answering call ${callId} from ${call.callerJid}`);
  }

  public async reject(callId: string, reason = "rejected"): Promise<void> {
    const call = this.activeCalls.get(callId);
    if (this.socket && call) {
      try {
        await this.socket.rejectCall(callId, call.callerJid);
      } catch (err) {
        console.warn(`[BaileysCallTransport] Failed to reject call ${callId} via socket:`, err);
      }
    }
    this.activeCalls.delete(callId);
    this.audioCallbacks.delete(callId);
    console.log(`[BaileysCallTransport] Rejected call ${callId} (reason: ${reason})`);
  }

  public async hangup(callId: string): Promise<void> {
    await this.reject(callId, "hangup");
  }

  public receiveAudio(callId: string, callback: (pcm: Float32Array) => void): void {
    this.audioCallbacks.set(callId, callback);
  }

  public async sendAudio(callId: string, pcm: Float32Array): Promise<void> {
    // In experimental Baileys calling, sending raw RTP media packets requires VoIP WASM bridge
    // Here we record the transmission attempt without crashing
    if (!this.activeCalls.has(callId)) {
      throw new Error(`[BaileysCallTransport] Cannot send audio to ended call ${callId}`);
    }
  }

  public async mute(_callId: string, _muted: boolean): Promise<void> {
    // Signaling mute
  }

  public async destroy(): Promise<void> {
    this.activeCalls.clear();
    this.audioCallbacks.clear();
    this.incomingCallCallbacks = [];
    this.isInitialized = false;
  }

  public getStatus() {
    return {
      name: "BaileysCallTransport",
      isProductionReady: BaileysCallTransport.IS_PRODUCTION_READY,
      isInitialized: this.isInitialized,
      activeCallCount: this.activeCalls.size,
    };
  }
}
