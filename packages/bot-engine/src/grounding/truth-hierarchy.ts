/**
 * Truth Hierarchy
 * Immutable system policy establishing the precedence of information sources.
 * Lower levels may NEVER override higher-level verified truth.
 */

export enum TruthLevel {
  CURRENT_VERIFIED_TOOL_DATA = 1, // Live calculator, live weather, live device status
  TRUSTED_INTERNAL_DATABASE = 2,  // Tarik verified facts, user records, portfolio database
  VERIFIED_PRIMARY_WEB_SOURCE = 3,// Real-time verified primary web data with citation
  APPROVED_KNOWLEDGE = 4,         // Static FAQ, approved company/portfolio documentation
  RELEVANT_MEMORY = 5,            // Past conversations, episodic preferences
  GENERAL_MODEL_KNOWLEDGE = 6,    // Base LLM parametric training weights
}

export interface TruthSource {
  level: TruthLevel;
  sourceId: string;
  name: string;
  verifiedAt: number;
}

export function compareTruthPriority(a: TruthLevel, b: TruthLevel): number {
  // Lower numeric value = Higher precedence
  return a - b;
}
