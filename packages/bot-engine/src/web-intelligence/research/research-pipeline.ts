import { searchProviderRegistry } from "../search/provider-registry.ts";
import { safeWebFetcher } from "../fetch/safe-fetcher.ts";
import { contentExtractor } from "../extract/content-extractor.ts";
import { contradictionEngine, type ConflictReport } from "../verification/contradiction-engine.ts";
import { citationManager } from "../citations/citation-manager.ts";
import { calculateAuthorityScore, type SourceObject } from "../sources/source-model.ts";

export type ResearchMode = "CASUAL" | "SIMPLE_FACT" | "CURRENT_FACT" | "IMPORTANT" | "DEEP_RESEARCH";

export interface ResearchResult {
  mode: ResearchMode;
  query: string;
  answerSummary: string;
  sources: SourceObject[];
  conflictReport: ConflictReport;
  keyFacts: string[];
  citationText: string;
  hasLiveInformation: boolean;
}

export function determineResearchMode(text: string): ResearchMode {
  const clean = text.trim().toLowerCase();

  // 1. Casual: greetings, short confirmations, emotional pings, smalltalk
  if (
    /^(hi|hello|hey|ok|haan|hnn|theek|achha|bye|gn|gm|good morning|good night|kya haal|kaise ho|miss you|love you)\b/i.test(
      clean,
    ) &&
    clean.split(" ").length <= 4
  ) {
    return "CASUAL";
  }

  // 2. Important: official rules, policy, legal, government, taxes, critical dates
  if (/\b(government|rule|policy|tax|visa|law|circular|official notice|court|exam date)\b/i.test(clean)) {
    return "IMPORTANT";
  }

  // 3. Current facts: weather, current price, latest news, today, release version, score
  if (/\b(aaj|today|current|latest|price|rate|score|match|weather|baarish|release|update|version)\b/i.test(clean)) {
    return "CURRENT_FACT";
  }

  // 4. Simple facts: factual questions "what is", "who is", "kya hai", "kahan hai"
  if (/\b(kya hai|what is|who is|who founded|capital of|meaning of)\b/i.test(clean)) {
    return "SIMPLE_FACT";
  }

  // Default to casual if no research indicators present
  return "CASUAL";
}

export class WebResearchPipeline {
  public async executeResearch(query: string, explicitMode?: ResearchMode): Promise<ResearchResult> {
    const mode = explicitMode ?? determineResearchMode(query);

    if (mode === "CASUAL") {
      return {
        mode,
        query,
        answerSummary: "",
        sources: [],
        conflictReport: {
          status: "uncertain",
          primaryClaim: "",
          contradictingClaims: [],
          explanation: "No research needed for casual turn.",
          hasConflict: false,
        },
        keyFacts: [],
        citationText: "",
        hasLiveInformation: false,
      };
    }

    const limit = mode === "SIMPLE_FACT" ? 2 : mode === "CURRENT_FACT" ? 3 : 5;
    const searchResults = await searchProviderRegistry.search(query, limit);

    if (searchResults.length === 0) {
      return {
        mode,
        query,
        answerSummary: "",
        sources: [],
        conflictReport: {
          status: "uncertain",
          primaryClaim: "",
          contradictingClaims: [],
          explanation: "No live web results found.",
          hasConflict: false,
        },
        keyFacts: [],
        citationText: "",
        hasLiveInformation: false,
      };
    }

    const sources: SourceObject[] = [];
    const claimsWithSource: Array<{ claim: string; source: SourceObject }> = [];
    const allKeyFacts: string[] = [];

    // Fetch and extract content from the top 1-2 results (to keep latency low and safe)
    const fetchLimit = mode === "IMPORTANT" || mode === "DEEP_RESEARCH" ? 2 : 1;
    for (let i = 0; i < Math.min(searchResults.length, fetchLimit); i++) {
      const item = searchResults[i];
      let domain = "";
      try {
        domain = new URL(item.url).hostname;
      } catch {
        /* ignore */
      }

      const source: SourceObject = {
        sourceId: `src_${i + 1}`,
        url: item.url,
        title: item.title,
        publisher: domain || item.title,
        sourceType: item.sourceType,
        retrievedAt: new Date().toISOString(),
        freshness: item.publishedDate ? 0.9 : 0.7,
        authorityScore: item.authorityScore || calculateAuthorityScore(item.sourceType, domain),
        contentHash: "",
        snippet: item.snippet,
      };

      sources.push(source);

      if (item.snippet) {
        claimsWithSource.push({ claim: item.snippet, source });
        allKeyFacts.push(item.snippet);
      }

      // If needed, fetch full page
      if (item.url && (mode === "CURRENT_FACT" || mode === "IMPORTANT")) {
        const fetchRes = await safeWebFetcher.fetchUrl(item.url);
        if (fetchRes.ok && fetchRes.content) {
          const extracted = contentExtractor.extract(fetchRes.content, item.title);
          for (const fact of extracted.keyFacts.slice(0, 3)) {
            claimsWithSource.push({ claim: fact, source });
            allKeyFacts.push(fact);
          }
        }
      }
    }

    const conflictReport = contradictionEngine.analyzeClaims(claimsWithSource);
    const citationText = citationManager.formatCitations(sources, { maxCitations: 2 });
    const answerSummary = conflictReport.primaryClaim || allKeyFacts[0] || "";

    return {
      mode,
      query,
      answerSummary,
      sources,
      conflictReport,
      keyFacts: allKeyFacts.slice(0, 5),
      citationText,
      hasLiveInformation: sources.length > 0 && Boolean(answerSummary),
    };
  }
}

export const webResearchPipeline = new WebResearchPipeline();
