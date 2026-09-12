import type { FactClaim, SourceObject } from "../sources/source-model.ts";

export type VerificationStatus = "verified_agreement" | "conflict_detected" | "single_source" | "uncertain";

export interface ConflictReport {
  status: VerificationStatus;
  primaryClaim: string;
  contradictingClaims: string[];
  preferredSource?: SourceObject;
  explanation: string;
  hasConflict: boolean;
}

export class ContradictionEngine {
  public analyzeClaims(
    claims: Array<{ claim: string; source: SourceObject }>,
  ): ConflictReport {
    if (claims.length === 0) {
      return {
        status: "uncertain",
        primaryClaim: "",
        contradictingClaims: [],
        explanation: "No claims retrieved to verify.",
        hasConflict: false,
      };
    }

    if (claims.length === 1) {
      return {
        status: "single_source",
        primaryClaim: claims[0].claim,
        contradictingClaims: [],
        preferredSource: claims[0].source,
        explanation: `Sourced from single reference: ${claims[0].source.title}`,
        hasConflict: false,
      };
    }

    // Sort claims by authority score (highest first)
    const sorted = [...claims].sort((a, b) => {
      if (b.source.authorityScore !== a.source.authorityScore) {
        return b.source.authorityScore - a.source.authorityScore;
      }
      return b.source.freshness - a.source.freshness;
    });

    const best = sorted[0];
    const contradictions: string[] = [];

    // Check for numerical or polar contradictions (e.g. "released in 2024" vs "released in 2023", "free" vs "paid", "open" vs "closed")
    for (let i = 1; i < sorted.length; i++) {
      const other = sorted[i];
      if (this.detectPolarOrValueConflict(best.claim, other.claim)) {
        contradictions.push(other.claim);
      }
    }

    if (contradictions.length > 0) {
      return {
        status: "conflict_detected",
        primaryClaim: best.claim,
        contradictingClaims: contradictions,
        preferredSource: best.source,
        explanation: `Sources differ on details. Official/higher-authority source (${best.source.publisher || best.source.title}) indicates: "${best.claim}".`,
        hasConflict: true,
      };
    }

    return {
      status: "verified_agreement",
      primaryClaim: best.claim,
      contradictingClaims: [],
      preferredSource: best.source,
      explanation: `Multiple sources corroborate this information (${sorted.map((s) => s.source.publisher || s.source.title).join(", ")}).`,
      hasConflict: false,
    };
  }

  private detectPolarOrValueConflict(textA: string, textB: string): boolean {
    const a = textA.toLowerCase();
    const b = textB.toLowerCase();

    // Check polar opposites
    const polarPairs = [
      ["free", "paid"],
      ["open", "closed"],
      ["yes", "no"],
      ["active", "inactive"],
      ["available", "unavailable"],
      ["postponed", "scheduled"],
      ["cancelled", "scheduled"],
      ["cancelled", "confirmed"],
      ["postponed", "confirmed"],
      ["delayed", "on time"],
    ];

    for (const [w1, w2] of polarPairs) {
      if ((a.includes(w1) && b.includes(w2)) || (a.includes(w2) && b.includes(w1))) {
        return true;
      }
    }

    // Check distinct numbers/dates if both are short statements
    const numbersA = (a.match(/\b\d+(\.\d+)?\b/g) || []).sort();
    const numbersB = (b.match(/\b\d+(\.\d+)?\b/g) || []).sort();

    if (numbersA.length === 1 && numbersB.length === 1 && numbersA[0] !== numbersB[0]) {
      return true;
    }

    return false;
  }
}

export const contradictionEngine = new ContradictionEngine();
