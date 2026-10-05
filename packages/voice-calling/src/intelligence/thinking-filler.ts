/**
 * Natural Conversational Thinking Fillers
 * Requirement 21: If processing takes longer, use a short natural acknowledgment.
 * There must be a cooldown to prevent repetitive filler phrases.
 */

export class ThinkingFillerManager {
  private static readonly FILLERS = [
    "haan, ek second.",
    "achha, samajh raha hoon.",
    "ji, ek minute dekh raha hoon.",
    "theek hai, samajh gaya.",
  ];

  private lastFillerTime = 0;
  private cooldownMs: number;
  private fillerIndex = 0;

  constructor(cooldownMs = 20_000) {
    this.cooldownMs = cooldownMs;
  }

  public shouldPlayFiller(elapsedThinkingMs: number): boolean {
    const now = Date.now();
    // Only play if thinking has taken > 750ms and cooldown has elapsed
    if (elapsedThinkingMs >= 750 && now - this.lastFillerTime >= this.cooldownMs) {
      return true;
    }
    return false;
  }

  public getNextFiller(): string {
    this.lastFillerTime = Date.now();
    const filler = ThinkingFillerManager.FILLERS[this.fillerIndex % ThinkingFillerManager.FILLERS.length];
    this.fillerIndex++;
    return filler;
  }

  public reset(): void {
    this.lastFillerTime = 0;
  }
}
