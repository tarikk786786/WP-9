import type { ConversationHistoryEntry } from "./context.ts";

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
    /<think>[\s\S]*?<\/think>/gi,
  ];

  public sanitize(text: string): string {
    let clean = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

    for (const phrase of this.roboticPhrases) {
      clean = clean.replace(phrase, "").trim();
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

  public audit(text: string, history: ConversationHistoryEntry[]): QualityGateAudit {
    const reasons: string[] = [];
    let sanitized = this.sanitize(text);

    if (!sanitized) {
      sanitized = "Ji samajh gaya. Bataiye main aapki kya madad kar sakta hoon?";
      reasons.push("Empty after stripping robotic noise");
    }

    // Check repetition
    if (this.checkRepetition(sanitized, history)) {
      reasons.push("Accidental repetitive response detected");
      // Add natural variation
      sanitized = `Ji bilkul! ${sanitized}`;
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
