import { CallContextBuilder } from "./context.js";
import type { SpokenResponseContext } from "../types.js";

export interface SpokenResponseResult {
  text: string;
  toolUsed?: string;
  latencyMs: number;
}

/**
 * Voice Call Spoken Response Engine
 * Reuses WP-9 AI models (Groq 120B / OpenAI) with voice brevity & low-latency constraints.
 */
export class CallResponseEngine {
  public async generateResponse(ctx: SpokenResponseContext): Promise<SpokenResponseResult> {
    const start = Date.now();
    const { systemPrompt, conversationHistory } = CallContextBuilder.buildCompactContext(ctx);

    const groqKey = process.env.GROQ_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    // Check for quick standard voice turns before remote model
    const quickReply = this.resolveQuickTurn(ctx.currentUtterance);
    if (quickReply) {
      return {
        text: quickReply,
        latencyMs: Date.now() - start,
      };
    }

    // Try Groq 120B model first (ultra low-latency)
    if (groqKey) {
      try {
        const messages = [
          { role: "system", content: systemPrompt },
          ...conversationHistory,
          { role: "user", content: ctx.currentUtterance },
        ];

        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${groqKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "openai/gpt-oss-120b",
            messages,
            temperature: 0.3,
            max_tokens: 150, // Keep short for phone calls (1–2 sentences)
          }),
          signal: AbortSignal.timeout(6_000),
        });

        if (res.ok) {
          const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
          const reply = data.choices?.[0]?.message?.content?.trim();
          if (reply) {
            return {
              text: this.cleanSpokenOutput(reply),
              latencyMs: Date.now() - start,
            };
          }
        }
      } catch (err) {
        console.warn("[CallResponseEngine] Groq generation failed, falling back:", err);
      }
    }

    // Fallback to OpenAI if configured
    if (openaiKey) {
      try {
        const messages = [
          { role: "system", content: systemPrompt },
          ...conversationHistory,
          { role: "user", content: ctx.currentUtterance },
        ];

        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages,
            temperature: 0.3,
            max_tokens: 120,
          }),
          signal: AbortSignal.timeout(6_000),
        });

        if (res.ok) {
          const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
          const reply = data.choices?.[0]?.message?.content?.trim();
          if (reply) {
            return {
              text: this.cleanSpokenOutput(reply),
              latencyMs: Date.now() - start,
            };
          }
        }
      } catch (err) {
        console.warn("[CallResponseEngine] OpenAI generation failed:", err);
      }
    }

    // Deterministic spoken fallback (Requirement 30)
    return {
      text: this.getDeterministicFallback(ctx.detectedLanguage),
      latencyMs: Date.now() - start,
    };
  }

  private resolveQuickTurn(utterance: string): string | null {
    const clean = utterance.trim().toLowerCase();
    if (/^(haan|hello|hi|namaste|hey)\??$/i.test(clean)) {
      return "Namaste! Haan boliye, main sun raha hoon.";
    }
    if (/^(sun\s*rahe\s*ho|sun\s*rha\s*h|are\s*you\s*there)\??$/i.test(clean)) {
      return "haan, bilkul sun raha hoon. bolo.";
    }
    if (/^(kya\s*hua|kya\s*scene\s*hai)\??$/i.test(clean)) {
      return "theek hoon, shukriya! aap bataiye, kya baat hai?";
    }
    return null;
  }

  private cleanSpokenOutput(rawText: string): string {
    let clean = rawText.replace(/[*_#`]/g, "").trim();
    // Split into sentences and keep only first 2 sentences for phone brevity
    const sentences = clean.split(/(?<=[.!?।])\s+/);
    if (sentences.length > 2) {
      clean = sentences.slice(0, 2).join(" ");
    }
    return clean;
  }

  private getDeterministicFallback(lang: string): string {
    if (lang === "en") {
      return "Yes, I am listening. Please let me know what you need.";
    }
    return "Ji, main sun raha hoon. Kripya batayein aapko kya help chahiye.";
  }
}
