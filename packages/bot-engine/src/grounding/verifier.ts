/**
 * Grounding Checker
 * Verifies candidate model drafts against the Truth Hierarchy and collected evidence.
 * Flags ungrounded / hallucinated claims and rewrites or qualifies them.
 */

import { claimExtractor, type FactualClaim } from './claims.ts';
import { type EvidenceItem } from './evidence.ts';
import { unknownHandler, type UnknownEvaluationResult } from './unknown.ts';

export interface GroundingAuditResult {
  grounded: boolean;
  claims: FactualClaim[];
  supportedClaims: FactualClaim[];
  unsupportedClaims: FactualClaim[];
  certainty: UnknownEvaluationResult;
  repairedText?: string;
}

export class GroundingChecker {
  public verify(draftText: string, evidenceList: EvidenceItem[]): GroundingAuditResult {
    if (!draftText) {
      return {
        grounded: true,
        claims: [],
        supportedClaims: [],
        unsupportedClaims: [],
        certainty: unknownHandler.evaluate(0, 0, false),
      };
    }

    const claims = claimExtractor.extractClaims(draftText);
    const supportedClaims: FactualClaim[] = [];
    const unsupportedClaims: FactualClaim[] = [];

    // Combine all evidence content into a searchable corpus
    const evidenceCorpus = evidenceList.map((e) => e.content.toLowerCase()).join(' ');

    for (const claim of claims) {
      let isSupported = false;

      // Match exact string if present
      if (claim.exactMatch && evidenceCorpus.includes(claim.exactMatch.toLowerCase())) {
        isSupported = true;
      } else if (claim.claimType === 'contact' && claim.exactMatch) {
        // Verified domain check
        if (claim.exactMatch.includes('tarikislam.in') || evidenceCorpus.includes(claim.exactMatch.toLowerCase())) {
          isSupported = true;
        }
      } else if (claim.claimType === 'location') {
        if (evidenceCorpus.includes('muzaffarpur') || evidenceCorpus.includes('delhi') || evidenceCorpus.includes('bihar')) {
          isSupported = true;
        }
      }

      if (isSupported) {
        supportedClaims.push(claim);
      } else {
        unsupportedClaims.push(claim);
      }
    }

    const certainty = unknownHandler.evaluate(
      claims.length,
      supportedClaims.length,
      false
    );

    let repairedText: string | undefined;

    // If unsupported price claims exist, strip or qualify them to prevent invented quotes
    if (unsupportedClaims.some((c) => c.claimType === 'price')) {
      repairedText = 'Project ki pricing scope aur requirements pe depend karti hai. Aap requirement share karein toh main exact quote bata sakta hoon.';
    }

    return {
      grounded: unsupportedClaims.length === 0,
      claims,
      supportedClaims,
      unsupportedClaims,
      certainty,
      repairedText,
    };
  }
}

export const groundingChecker = new GroundingChecker();
