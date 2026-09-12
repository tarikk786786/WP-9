/**
 * Evidence Span Representation
 */

import { TruthLevel } from './truth-hierarchy.ts';

export interface EvidenceItem {
  id: string;
  level: TruthLevel;
  source: string;
  content: string;
  confidence: number;
}

export class EvidenceCollector {
  public static createToolEvidence(toolName: string, content: string): EvidenceItem {
    return {
      id: `ev_tool_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      level: TruthLevel.CURRENT_VERIFIED_TOOL_DATA,
      source: `tool:${toolName}`,
      content,
      confidence: 1.0,
    };
  }

  public static createDatabaseEvidence(sourceKey: string, content: string): EvidenceItem {
    return {
      id: `ev_db_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      level: TruthLevel.TRUSTED_INTERNAL_DATABASE,
      source: `database:${sourceKey}`,
      content,
      confidence: 0.98,
    };
  }

  public static createWebEvidence(url: string, content: string): EvidenceItem {
    return {
      id: `ev_web_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      level: TruthLevel.VERIFIED_PRIMARY_WEB_SOURCE,
      source: url,
      content,
      confidence: 0.9,
    };
  }
}
