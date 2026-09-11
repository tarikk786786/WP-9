import { upsertConversationTurn } from "@bot/database";
import type { InboundEventPayload } from "./event-gate.ts";
import type { ActiveConversationState, EmotionState, UserGoal } from "./state.ts";

export interface QuotedContext {
  id?: string;
  sender?: string;
  text: string;
  fromMe?: boolean;
}

export interface InboundMessageFragment extends InboundEventPayload {}

export interface ConversationTurn {
  turnId: string;
  tenantId: string;
  chatId: string;
  userId?: string;
  sender: string;
  fromName?: string;
  isGroup: boolean;
  messageIds: string[];
  rawMessages: InboundMessageFragment[];
  fragments: InboundMessageFragment[];
  firstMessageId: string;
  lastMessageId: string;
  combinedText: string;
  normalizedText?: string;
  semanticText?: string;
  language?: string;
  intent?: string;
  subIntent?: string;
  entities?: Record<string, string>;
  references?: Record<string, string>;
  emotion?: EmotionState;
  tone?: string;
  urgency?: "low" | "medium" | "high";
  goal?: UserGoal;
  conversationState?: ActiveConversationState;
  confidence?: number;
  quoted?: QuotedContext;
  createdAt: number;
}

export function isSemanticallyComplete(text: string): boolean {
  const clean = text.trim().toLowerCase();
  if (!clean) return false;

  // Single word callouts or preambles
  const incompleteWords = new Set([
    "bhai", "bhaiya", "bro", "bhaii", "bhaijaan", "sun", "suno", "sunona", "hey", "hi", "hello",
    "yaar", "yr", "plz", "please", "dekho", "ek", "aur", "and", "so", "but", "kya", "kyu", "kyun",
    "haan", "hn", "acha", "achha", "okk", "ok", "listen", "bata", "bol", "wait", "ruko"
  ]);
  if (incompleteWords.has(clean)) return false;

  // Hanging trailing punctuation indicating unfinished thought (dots, commas, dash)
  if (/[,\-–—\.\.]{1,3}$/.test(clean) && !/[?!.]$/.test(clean.replace(/\.{2,}/g, ""))) {
    return false;
  }

  // Hanging phrases / conjunctions / preambles
  const incompletePreamblePatterns = [
    /^(aur\s+sun|ek\s+baat|ek\s+min|ek\s+second|wait\s+karo|ruk|ruko|waise|actually|batao\s+na|woh\s+kya\s+hai\s+na|kal\s+jo\s+hua|kal\s+jo\s+maine|sun\s+bhai|bhai\s+sun)$/i,
    /^(and|but|or|so|because|also|well|like|wait)$/i,
    /\b(ek\s+baat\s+hai|kal\s+jo|par\s+ek|lekin\s+ek)$/i,
  ];

  for (const pattern of incompletePreamblePatterns) {
    if (pattern.test(clean)) return false;
  }

  // Trailing hanging connector particles in short text
  const words = clean.split(/\s+/);
  if (words.length <= 3) {
    const lastWord = words[words.length - 1];
    if (["jo", "ki", "ka", "ke", "ko", "se", "me", "mein", "par", "lekin", "agar"].includes(lastWord)) {
      return false;
    }
  }

  return true;
}

export type TurnReadyHandler = (turn: ConversationTurn) => Promise<void> | void;

interface PendingTurnBuffer {
  tenantId: string;
  chatId: string;
  fragments: InboundMessageFragment[];
  firstReceivedAt: number;
  timer: ReturnType<typeof setTimeout>;
}

export class ConversationTurnBuilder {
  private buffers: Map<string, PendingTurnBuffer> = new Map();
  private handler: TurnReadyHandler | null = null;
  private defaultDebounceMs: number;
  private incompleteDebounceMs: number;
  private maxWaitMs: number;

  constructor(opts?: {
    defaultDebounceMs?: number;
    incompleteDebounceMs?: number;
    maxWaitMs?: number;
  }) {
    this.defaultDebounceMs = opts?.defaultDebounceMs ?? 800;
    this.incompleteDebounceMs = opts?.incompleteDebounceMs ?? 1800;
    this.maxWaitMs = opts?.maxWaitMs ?? 4000;
  }

  public onTurnReady(handler: TurnReadyHandler) {
    this.handler = handler;
  }

  public generateTurnId(chatId: string, firstMessageId: string, timestamp: number): string {
    // 60-second deterministic bucket to guarantee idempotent recovery
    const bucket = Math.floor(timestamp / 60_000) * 60_000;
    return `turn_${chatId}_${firstMessageId}_${bucket}`;
  }

  public pushFragment(fragment: InboundMessageFragment) {
    const key = `${fragment.tenantId}:${fragment.chatId}`;
    const now = Date.now();
    const existing = this.buffers.get(key);

    if (existing) {
      clearTimeout(existing.timer);
      existing.fragments.push(fragment);

      const allTexts = existing.fragments.map((f) => f.text.trim()).filter(Boolean);
      const combined = allTexts.join(" ");
      const complete = isSemanticallyComplete(combined);

      const elapsed = now - existing.firstReceivedAt;
      const remainingBeforeMax = Math.max(100, this.maxWaitMs - elapsed);

      let targetDelay = complete ? this.defaultDebounceMs : this.incompleteDebounceMs;
      targetDelay = Math.min(targetDelay, remainingBeforeMax);

      existing.timer = setTimeout(() => {
        void this.flush(key);
      }, targetDelay);
    } else {
      const complete = isSemanticallyComplete(fragment.text);
      const delay = complete ? this.defaultDebounceMs : this.incompleteDebounceMs;

      const timer = setTimeout(() => {
        void this.flush(key);
      }, delay);

      this.buffers.set(key, {
        tenantId: fragment.tenantId,
        chatId: fragment.chatId,
        fragments: [fragment],
        firstReceivedAt: now,
        timer,
      });
    }
  }

  public async flush(key: string): Promise<ConversationTurn | null> {
    const buffer = this.buffers.get(key);
    if (!buffer || buffer.fragments.length === 0) {
      this.buffers.delete(key);
      return null;
    }

    clearTimeout(buffer.timer);
    this.buffers.delete(key);

    const fragments = buffer.fragments;
    const first = fragments[0];
    const last = fragments[fragments.length - 1];

    const textLines = fragments.map((f) => f.text.trim()).filter(Boolean);
    const combinedText = textLines.join("\n");

    const quoted = fragments.slice().reverse().find((f) => Boolean(f.quoted))?.quoted;

    const turnId = this.generateTurnId(buffer.chatId, first.messageId, buffer.firstReceivedAt);
    const turn: ConversationTurn = {
      turnId,
      tenantId: buffer.tenantId,
      chatId: buffer.chatId,
      userId: last.sender,
      rawMessages: fragments,
      fragments,
      combinedText,
      messageIds: fragments.map((f) => f.messageId),
      firstMessageId: first.messageId,
      lastMessageId: last.messageId,
      sender: last.sender,
      fromName: last.fromName || first.fromName,
      isGroup: Boolean(last.isGroup),
      quoted,
      createdAt: buffer.firstReceivedAt,
    };

    // Persist conversation turn to database
    await upsertConversationTurn({
      turnId: turn.turnId,
      chatId: turn.chatId,
      messageIds: turn.messageIds,
      combinedText: turn.combinedText,
      status: "created",
    });

    if (this.handler) {
      try {
        await this.handler(turn);
      } catch (err) {
        console.error(`[turn-builder] Error processing turn ${turn.turnId}:`, err);
      }
    }

    return turn;
  }

  public clear() {
    for (const buf of this.buffers.values()) {
      clearTimeout(buf.timer);
    }
    this.buffers.clear();
  }
}

export const turnBuilder = new ConversationTurnBuilder();
