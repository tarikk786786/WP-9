import type { CanonicalContext } from "./context.ts";
import { toolRunner } from "./tool-runner.ts";

export interface CandidateResponse {
  source: "rule" | "faq" | "ai_fast" | "ai_strong" | "tool" | "fallback";
  text: string;
  confidence: number;
  modelId?: string;
  toolsUsed?: string[];
  executionTimeMs: number;
}

export type AiGenerator = (
  context: CanonicalContext,
  tier: "fast" | "strong"
) => Promise<{ text: string; modelId?: string } | null>;

export class ModelRouter {
  private aiGenerator: AiGenerator | null = null;
  public aiTimeoutMs: number;

  constructor(aiTimeoutMs = 7000) {
    this.aiTimeoutMs = aiTimeoutMs;
  }

  public setAiGenerator(generator: AiGenerator) {
    this.aiGenerator = generator;
  }

  /**
   * Generates candidate responses and selects exactly ONE winner BEFORE commit.
   * Failover order:
   * 1. Exact / High-confidence Rule match
   * 2. Direct Tool execution (if tool-specific intent)
   * 3. Exact FAQ match
   * 4. AI Fast Model
   * 5. AI Strong Model (on fast model failure)
   * 6. Deterministic Fallback
   */
  public async resolveCandidate(context: CanonicalContext): Promise<CandidateResponse> {
    const start = Date.now();
    const { turn, understanding, rules, faqs } = context;
    const cleanText = understanding.normalizedText.toLowerCase();

    // 1. Check Automation Rules
    if (rules && rules.length > 0) {
      for (const rule of rules) {
        if (rule.triggerValue && cleanText.includes(rule.triggerValue.toLowerCase())) {
          return {
            source: "rule",
            text: rule.response,
            confidence: 1.0,
            executionTimeMs: Date.now() - start,
          };
        }
      }
    }

    // 2. Check Live Tools (e.g. Weather)
    if (understanding.intents.includes("weather")) {
      const toolRes = await toolRunner.runTool("weather", { query: turn.combinedText });
      if (toolRes.success && toolRes.result) {
        return {
          source: "tool",
          text: toolRes.result,
          confidence: 0.95,
          toolsUsed: ["weather"],
          executionTimeMs: Date.now() - start,
        };
      }
    }

    // 3. Check FAQs
    if (faqs && faqs.length > 0) {
      for (const faq of faqs) {
        const qClean = faq.question.toLowerCase().trim();
        if (cleanText === qClean || (qClean.length > 5 && cleanText.includes(qClean))) {
          return {
            source: "faq",
            text: faq.answer,
            confidence: 0.9,
            executionTimeMs: Date.now() - start,
          };
        }
      }
    }

    // 4. AI Generation with Pre-Commit Failover (Fast -> Strong)
    if (this.aiGenerator && context.settings.aiEnabled !== false) {
      try {
        const fastResult = await Promise.race([
          this.aiGenerator(context, "fast"),
          new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error("AI Fast model timeout")), this.aiTimeoutMs)
          ),
        ]);

        if (fastResult && fastResult.text.trim()) {
          return {
            source: "ai_fast",
            text: fastResult.text.trim(),
            confidence: 0.85,
            modelId: fastResult.modelId,
            executionTimeMs: Date.now() - start,
          };
        }
      } catch (fastErr) {
        console.warn("[model-router] Fast AI failed, trying strong failover:", fastErr instanceof Error ? fastErr.message : fastErr);
      }

      // Strong failover
      try {
        const strongResult = await Promise.race([
          this.aiGenerator(context, "strong"),
          new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error("AI Strong model timeout")), this.aiTimeoutMs)
          ),
        ]);

        if (strongResult && strongResult.text.trim()) {
          return {
            source: "ai_strong",
            text: strongResult.text.trim(),
            confidence: 0.9,
            modelId: strongResult.modelId,
            executionTimeMs: Date.now() - start,
          };
        }
      } catch (strongErr) {
        console.warn("[model-router] Strong AI failed, falling back to deterministic reply:", strongErr instanceof Error ? strongErr.message : strongErr);
      }
    }

    // 5. Deterministic Fallback
    let fallbackText = "Ji samajh gaya. Iske baare mein aapko aur jankari chahiye toh batayein.";
    if (understanding.primaryIntent === "greeting") {
      fallbackText = "Hey! Kaise hain aap? Bataiye main aapki kya madad kar sakta hoon?";
    } else if (understanding.primaryIntent === "pricing") {
      const subject = understanding.entities.referencedSubject || "Humare services";
      fallbackText = `${subject} ka basic plan ₹999 se start hota hai. Aapko kaunsa package chahiye?`;
    } else if (understanding.primaryIntent === "delivery") {
      fallbackText = "Humari delivery standard 2-4 working days mein ho jaati hai.";
    } else if (understanding.primaryIntent === "meeting_availability") {
      fallbackText = "Haan bilkul, kal milte hain. Kitne baje theek rahega?";
    }

    return {
      source: "fallback",
      text: fallbackText,
      confidence: 0.7,
      executionTimeMs: Date.now() - start,
    };
  }
}

export const modelRouter = new ModelRouter();
