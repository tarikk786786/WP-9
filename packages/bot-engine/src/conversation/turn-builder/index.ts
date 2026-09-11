export interface QuotedContext {
  id?: string;
  sender?: string;
  text: string;
  fromMe?: boolean;
}

export interface InboundMessageFragment {
  tenantId: string;
  chatId: string;
  messageId: string;
  text: string;
  sender: string;
  fromName?: string;
  timestamp: number;
  quoted?: QuotedContext;
  isGroup?: boolean;
  mediaType?: string;
  mediaUrl?: string;
}

export interface ConversationTurn {
  turnId: string;
  tenantId: string;
  chatId: string;
  fragments: InboundMessageFragment[];
  combinedText: string;
  messageIds: string[];
  firstMessageId: string;
  lastMessageId: string;
  sender: string;
  fromName?: string;
  isGroup: boolean;
  quoted?: QuotedContext;
  createdAt: number;
}

export function isSemanticallyComplete(text: string): boolean {
  const clean = text.trim().toLowerCase();
  if (!clean) return false;

  // Single word callouts or greetings
  const incompleteWords = new Set([
    "bhai", "bhaiya", "bro", "bhaii", "bhaijaan", "sun", "suno", "sunona", "hey", "hi", "hello",
    "yaar", "yr", "plz", "please", "dekho", "ek", "aur", "and", "so", "but", "kya", "kyu", "kyun",
    "haan", "hn", "acha", "achha", "okk", "ok", "listen", "bata", "bol"
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

export type TurnHandler = (turn: ConversationTurn) => Promise<void> | void;

interface PendingChatBuffer {
  tenantId: string;
  chatId: string;
  fragments: InboundMessageFragment[];
  firstReceivedAt: number;
  timer: ReturnType<typeof setTimeout>;
}

export class ConversationTurnBuilder {
  private buffers: Map<string, PendingChatBuffer> = new Map();
  private handler: TurnHandler | null = null;
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

  public onTurnReady(handler: TurnHandler) {
    this.handler = handler;
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

      // Check how much total time has elapsed since first fragment
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

    // Combine texts preserving line breaks if multi-line, otherwise space
    const textLines = fragments.map((f) => f.text.trim()).filter(Boolean);
    const combinedText = textLines.join("\n");

    // Inherit latest quoted message if any fragment contains one
    const quoted = fragments.slice().reverse().find((f) => Boolean(f.quoted))?.quoted;

    const turnId = `turn_${buffer.chatId}_${first.messageId}_${Date.now()}`;
    const turn: ConversationTurn = {
      turnId,
      tenantId: buffer.tenantId,
      chatId: buffer.chatId,
      fragments,
      combinedText,
      messageIds: fragments.map((f) => f.messageId),
      firstMessageId: first.messageId,
      lastMessageId: last.messageId,
      sender: last.sender,
      fromName: last.fromName || first.fromName,
      isGroup: Boolean(first.isGroup || last.isGroup),
      quoted,
      createdAt: Date.now(),
    };

    if (this.handler) {
      try {
        await this.handler(turn);
      } catch (err) {
        console.error(`[turn-builder] Error in turn handler for ${key}:`, err);
      }
    }

    return turn;
  }

  public clear(key?: string) {
    if (key) {
      const b = this.buffers.get(key);
      if (b) clearTimeout(b.timer);
      this.buffers.delete(key);
    } else {
      for (const b of this.buffers.values()) {
        clearTimeout(b.timer);
      }
      this.buffers.clear();
    }
  }

  public getPendingCount(): number {
    return this.buffers.size;
  }
}

export const turnBuilder = new ConversationTurnBuilder();
