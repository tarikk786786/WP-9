import type { ConversationHistoryEntry } from "./context.ts";
import type { EmotionState } from "./state.ts";
import { validateDazyEthics } from "./dazy-profile.ts";
import {
  humanLanguageQualityEngine,
  HumanLanguageQualityEngine,
  type QualityScores,
  type QualityChecklist,
  type QualityPipelineResult,
  type QualityPipelineOptions,
} from "./language-quality-engine.ts";

export interface QualityGateAudit {
  passed: boolean;
  sanitizedText: string;
  reasons: string[];
  scores?: QualityScores;
  checklist?: QualityChecklist;
  repairsMade?: string[];
}

export class ResponseQualityGate {
  private engine: HumanLanguageQualityEngine;

  private roboticPhrases: RegExp[] = [
    /as an ai language model/i,
    /as an ai/i,
    /i am an ai/i,
    /i do not have feelings/i,
    /i apologize for (any )?inconvenience/i,
    /how may i assist you today/i,
    /feel free to reach out if you have any questions/i,
    /is there anything else i can help you with\??/i,
    /is there anything else i can assist you with\??/i,
    /thank you for (your )?compliment/i,
    /<think>[\s\S]*?<\/think>/gi,
  ];

  // Inappropriate fake emotional claims to be sanitized
  private fakeIntimacyClaims: Array<{ pattern: RegExp; replacement: string }> = [
    { pattern: /omg\s+i\s+am\s+so\s+sad\s+for\s+you/i, replacement: "That sounds really tough." },
    { pattern: /i\s+know\s+exactly\s+how\s+you\s+feel/i, replacement: "I can see why you'd feel that way." },
    { pattern: /i\s+love\s+talking\s+to\s+you\s+so\s+much/i, replacement: "Glad we connected." },
  ];

  constructor(engine?: HumanLanguageQualityEngine) {
    this.engine = engine ?? humanLanguageQualityEngine;
  }

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

    // Run through Human Language Quality stages
    const result = this.engine.process(clean, [], { isDazy });
    return result.sanitizedText;
  }

  /**
   * Anti-repetition check against last N outbound messages
   */
  public checkRepetition(text: string, history: ConversationHistoryEntry[]): boolean {
    return this.engine.contextChecker.checkRepetition(text, history);
  }

  public audit(
    text: string,
    historyOrOptions?: ConversationHistoryEntry[] | QualityPipelineOptions,
    maybeOptions?: QualityPipelineOptions
  ): QualityGateAudit {
    const history: ConversationHistoryEntry[] = Array.isArray(historyOrOptions) ? historyOrOptions : [];
    const options: QualityPipelineOptions | undefined = Array.isArray(historyOrOptions)
      ? maybeOptions
      : historyOrOptions;

    const pipelineResult: QualityPipelineResult = this.engine.process(text, history, options);

    const reasons = [...pipelineResult.reasons];
    if (pipelineResult.repairsMade.length > 0) {
      reasons.push(`Repairs applied: ${pipelineResult.repairsMade.slice(0, 3).join(", ")}`);
    }

    return {
      passed: pipelineResult.passed,
      sanitizedText: pipelineResult.sanitizedText,
      reasons,
      scores: pipelineResult.scores,
      checklist: pipelineResult.checklist,
      repairsMade: pipelineResult.repairsMade,
    };
  }
}

export const qualityGate = new ResponseQualityGate();
export * from "./language-quality-engine.ts";
