import type { ConversationHistoryEntry } from "./context.ts";
import type { EmotionState } from "./state.ts";
import { validateDazyEthics } from "./dazy-profile.ts";

export interface QualityGateAudit {
  passed: boolean;
  sanitizedText: string;
  reasons: string[];
}

export class ResponseQualityGate {
  private roboticPhrases: RegExp[] = [
    /as an ai language model/i,
    /as an ai/i,
    /i am an ai/i,
    /i do not have feelings/i,
    /i apologize for (any )?inconvenience/i,
    /how may i assist you today/i,
    /feel free to reach out if you have any questions/i,
    /is there anything else i can help you with\??/i,
    /thank you for (your )?compliment/i,
    /<think>[\s\S]*?<\/think>/gi,
  ];

  // Inappropriate fake emotional claims to be sanitized
  private fakeIntimacyClaims: Array<{ pattern: RegExp; replacement: string }> = [
    { pattern: /omg\s+i\s+am\s+so\s+sad\s+for\s+you/i, replacement: "That sounds really tough." },
    { pattern: /i\s+know\s+exactly\s+how\s+you\s+feel/i, replacement: "I can see why you'd feel that way." },
    { pattern: /i\s+love\s+talking\s+to\s+you\s+so\s+much/i, replacement: "Glad we connected." },
  ];

  public sanitize(text: string, isDazy = false): string {
    let clean = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

    for (const phrase of this.roboticPhrases) {
      clean = clean.replace(phrase, "").trim();
    }

    if (!isDazy) {
      for (const { pattern, replacement } of this.fakeIntimacyClaims) {
        clean = clean.replace(pattern, replacement).trim();
      }
    }

    // Clean redundant multiple spaces or dangling dashes
    clean = clean.replace(/\s+/g, " ").replace(/^[-–—]\s*/, "").trim();
    return clean;
  }

  /**
   * Anti-repetition check against last N outbound messages
   */
  public checkRepetition(text: string, history: ConversationHistoryEntry[]): boolean {
    const recentAssistant = history
      .filter((h) => h.role === "assistant")
      .slice(-3)
      .map((h) => h.text.trim().toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""));

    const candidateNorm = text.trim().toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

    for (const past of recentAssistant) {
      if (candidateNorm === past) return true;
      // High similarity (>85% character length match and substring)
      if (past.length > 15 && (candidateNorm.includes(past) || past.includes(candidateNorm))) {
        return true;
      }
    }
    return false;
  }

  public audit(
    text: string,
    history: ConversationHistoryEntry[],
    options?: { isDazy?: boolean; emotionState?: EmotionState }
  ): QualityGateAudit {
    const reasons: string[] = [];
    let sanitized = this.sanitize(text, options?.isDazy);

    if (!sanitized) {
      sanitized = options?.isDazy
        ? "haan meri jaan ❤️ batao"
        : "Ji samajh gaya. Bataiye main aapki kya madad kar sakta hoon?";
      reasons.push("Empty after stripping robotic noise");
    }

    // Ethical boundary check for DAZY profile
    if (options?.isDazy) {
      const ethics = validateDazyEthics(sanitized);
      if (!ethics.valid) {
        reasons.push(`DAZY ethics violation detected: ${ethics.violation}`);
        sanitized = "Main hamesha tumhari baat samajhne aur saath dene ke liye hoon ❤️";
      }
    }

    // Check repetition
    if (this.checkRepetition(sanitized, history)) {
      reasons.push("Accidental repetitive response detected");
      sanitized = options?.isDazy ? `${sanitized}` : `Ji bilkul! ${sanitized}`;
    }

    // Enforce WhatsApp Brevity: max 1200 characters
    if (sanitized.length > 1200) {
      sanitized = sanitized.slice(0, 1150).trim() + "...";
      reasons.push("Truncated excessive length for WhatsApp readability");
    }

    return {
      passed: reasons.length === 0,
      sanitizedText: sanitized,
      reasons,
    };
  }
}

export const qualityGate = new ResponseQualityGate();
