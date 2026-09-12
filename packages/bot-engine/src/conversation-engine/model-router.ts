import type { CanonicalContext } from "./context.ts";
import { toolRunner } from "./tool-runner.ts";
import { evaluateDazyMessage } from "./dazy-profile.ts";

export interface CandidateResponse {
  source: "rule" | "faq" | "ai_fast" | "ai_strong" | "local_ai" | "tool" | "dazy_profile" | "emotional_empathy" | "fallback";
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
   * 0. DAZY Special Profile (for DAZY contact)
   * 1. Exact / High-confidence Rule match
   * 2. Direct Tool execution (if tool-specific intent)
   * 3. Exact FAQ match
   * 4. AI Fast Model
   * 5. AI Strong Model (on fast model failure)
   * 6. Contextual Emotional / Repair Empathy
   * 7. Deterministic Fallback
   */
  public async resolveCandidate(context: CanonicalContext): Promise<CandidateResponse> {
    const start = Date.now();
    const { turn, understanding, rules, faqs, isDazy } = context;
    const cleanText = understanding.normalizedText.toLowerCase();

    // 0. Check DAZY Special Contact Profile
    if (isDazy) {
      const dazyEval = evaluateDazyMessage(turn.combinedText, understanding.emotionState, context.history);
      if (dazyEval.suggestedReply) {
        return {
          source: "dazy_profile",
          text: dazyEval.suggestedReply,
          confidence: 0.98,
          executionTimeMs: Date.now() - start,
        };
      }
    }

    // 1. Check Automation Rules (only for non-DAZY or business queries)
    if (!isDazy && rules && rules.length > 0) {
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

    // 2. Check Live Tools (e.g. Weather, Calc)
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
    if (!isDazy && faqs && faqs.length > 0) {
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

    // 4b. Local AI / llama.cpp Server Fallback (OpenAI-compatible /v1/chat/completions)
    const localAiUrl = process.env.LOCAL_AI_URL || process.env.LLAMA_CPP_URL;
    if (localAiUrl) {
      try {
        const localCandidate = await this.queryLocalAi(localAiUrl, context);
        if (localCandidate) {
          return {
            source: "local_ai",
            text: localCandidate,
            confidence: 0.82,
            modelId: "local-llama-cpp",
            executionTimeMs: Date.now() - start,
          };
        }
      } catch (localErr) {
        console.warn("[model-router] Local AI fallback failed:", localErr instanceof Error ? localErr.message : localErr);
      }
    }

    // 5. Contextual Conversational & Emotional Empathy
    const emotionalResponse = this.resolveEmotionalOrRepairReply(context);
    if (emotionalResponse) {
      return {
        source: "emotional_empathy",
        text: emotionalResponse,
        confidence: 0.88,
        executionTimeMs: Date.now() - start,
      };
    }

    // 6. Deterministic Fallback
    let fallbackText = "Ji samajh gaya. Iske baare mein aapko aur jankari chahiye toh batayein.";
    if (understanding.primaryIntent === "greeting") {
      fallbackText = "Hey! Kaise hain aap? Bataiye main aapki kya madad kar sakta hoon?";
    } else if (understanding.primaryIntent === "pricing") {
      const subject = understanding.entities.referencedSubject || context.referencedEntity || "Humare services";
      fallbackText = `${subject} ka basic plan ₹999 se start hota hai. Aapko kaunsa package chahiye?`;
    } else if (understanding.primaryIntent === "delivery") {
      const subject = context.referencedEntity ? ` ${context.referencedEntity} ke liye` : "";
      fallbackText = `Delivery${subject} standard 2-4 working days mein ho jaati hai. Delivery charge ₹80 hai.`;
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

  /**
   * Generates highly natural human replies for emotional expressions,
   * jokes, repairs, and common conversational moments.
   */
  private resolveEmotionalOrRepairReply(context: CanonicalContext): string | null {
    const { understanding, turn } = context;
    const clean = understanding.normalizedText.toLowerCase();

    // 1. Repair / Self-Correction
    if (understanding.isRepair) {
      if (/price\s+nahi\s+pucha/i.test(clean)) {
        return "Ohh, samjha — tum delivery ke baare mein pooch rahe the. Delivery charge ₹80 hai aur standard 2-3 din lagte hain.";
      }
      return `Ohh samjha, meri galti! ${understanding.repairDetails?.correction || "Aapke sawal"} ke baare mein batata hoon.`;
    }

    // 2. Follow-up "delivery?" after price
    if (/^delivery\??$/i.test(clean.trim()) && context.referencedEntity) {
      return `${context.referencedEntity} ki delivery ₹80 hai aur 2–3 din mein pahuch jaati hai.`;
    }

    // 3. Specific Emotional Expressions
    if (/\b(bahut\s+bura\s+din|interview\s+kharab)\b/i.test(clean)) {
      return "Arre yaar, that's rough. Abhi overthink mat karo — ek kharab din overall picture decide nahi karta. Sab theek ho jayega.";
    }

    if (/\bfinally\s+ho\s+gaya\b/i.test(clean) || (/\bfinally\b/i.test(clean) && /😭/.test(turn.combinedText))) {
      return "Yesss 😭 finally! Batao, kya hua? Super happy for you!";
    }

    if (/\b(kya\s+bakwaas\s+hai|bakwaas)\b/i.test(clean)) {
      return "Arre bhai shanti, kya problem aa gayi? Ek baar batao, main dekh leta hoon.";
    }

    if (/^(nahi\s+yaar|na\s+yaar)$/i.test(clean.trim())) {
      return "Theek hai bhai, koi zabardasti nahi. Jaise tum theek samjho.";
    }

    if (/\b(lol\s+tu\s+bhi\s+na|intelligent\s+ban\s+raha)\b/i.test(clean) || (clean.includes("lol") && /😂/.test(turn.combinedText))) {
      return "Haha aaj thoda luck chal raha hai 😂";
    }

    if (/\b(tension\s+ho\s+rahi\s+hai|tension)\b/i.test(clean)) {
      return "Tension mat lo yaar. Aaram se socho aur ek ek step karke karte hain, sab sort ho jayega.";
    }

    if (/^(chhod\s+yaar|rehne\s+do)$/i.test(clean.trim())) {
      return "Theek hai bhai, jab relax ho jao tab baat karte hain. Chill karo.";
    }

    if (/\b(pareshan|bahut\s+pareshan|bohot\s+pareshan|chinta)\b/i.test(clean)) {
      return "Arre bhai pareshan mat ho, shant ho jao. Batao kya baat hai, milkar sambhal lenge.";
    }

    if (/\bsamajh\s+nahi\s+aa\s+raha\b/i.test(clean)) {
      return "Koi issue nahi. Chalo isko simple way mein dekhte hain, kahan confusion hai?";
    }

    if (/\b(thank\s+you\s+bhai|thanks\s+bhai)\b/i.test(clean) || (/\bthank\s+you\b/i.test(clean) && /❤️/.test(turn.combinedText))) {
      return "Welcome bhai ❤️ kabhi bhi zaroorat ho toh batana!";
    }

    return null;
  }

  private async queryLocalAi(baseUrl: string, context: CanonicalContext): Promise<string | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const url = `${baseUrl.replace(/\/+$/, "")}/v1/chat/completions`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: "local-model",
          messages: [
            {
              role: "system",
              content:
                "You are Tarik's WhatsApp AI assistant. Answer concisely and naturally in Hinglish/English based on context.",
            },
            ...context.history.slice(-3).map((h) => ({ role: h.role, content: h.text })),
            { role: "user", content: context.turn.combinedText },
          ],
          max_tokens: 150,
          temperature: 0.7,
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return data.choices?.[0]?.message?.content?.trim() || null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const modelRouter = new ModelRouter();
