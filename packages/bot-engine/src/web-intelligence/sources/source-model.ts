export type SourceType =
  | "official_primary"
  | "government_institution"
  | "academic_research"
  | "official_documentation"
  | "reputable_journalism"
  | "secondary_source"
  | "community_source"
  | "search_snippet"
  | "model_memory";

export interface SourceObject {
  sourceId: string;
  url: string;
  title: string;
  publisher: string;
  sourceType: SourceType;
  publishedAt?: string;
  retrievedAt: string;
  freshness: number; // 0 to 1 score (1 = published today)
  authorityScore: number; // 0 to 100
  contentHash: string;
  snippet?: string;
}

export interface FactClaim {
  claimId: string;
  text: string;
  sourceIds: string[];
  confidence: number; // 0 to 100
  freshness: number; // 0 to 1
  conflicts?: string[]; // IDs of conflicting claims
  isVerified: boolean;
}

export const SOURCE_AUTHORITY_WEIGHTS: Record<SourceType, number> = {
  official_primary: 100,
  government_institution: 95,
  academic_research: 90,
  official_documentation: 85,
  reputable_journalism: 75,
  secondary_source: 60,
  community_source: 40,
  search_snippet: 30,
  model_memory: 10,
};

export function calculateAuthorityScore(type: SourceType, domain?: string): number {
  let score = SOURCE_AUTHORITY_WEIGHTS[type] ?? 50;
  if (domain) {
    if (domain.endsWith(".gov") || domain.endsWith(".gov.in") || domain.endsWith(".nic.in")) {
      score = Math.max(score, 95);
    } else if (domain.endsWith(".edu") || domain.endsWith(".ac.in")) {
      score = Math.max(score, 90);
    } else if (domain.includes("wikipedia.org")) {
      score = 65; // Good community overview, not primary
    }
  }
  return score;
}
