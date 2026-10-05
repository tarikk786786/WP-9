import type { SpokenResponseContext, VoiceTurn } from "../types.js";

/**
 * Compact Call Context Builder
 * Requirement 17: Do not dump the entire database context into every LLM call.
 * Builds a compact, relevant call context from the current call turns and core facts.
 */
export class CallContextBuilder {
  public static buildCompactContext(ctx: SpokenResponseContext): {
    systemPrompt: string;
    conversationHistory: Array<{ role: "user" | "assistant"; text: string }>;
  } {
    const systemPrompt = [
      "You are the WP-9 WhatsApp Voice Call Assistant speaking directly on a real phone call.",
      "Spoken Voice Rule: Phone conversation must be natural, brief, polite, and direct (1–2 short spoken lines max).",
      "Language: Reply in the caller's language. If they speak Hindi or Hinglish, reply in natural everyday spoken Hinglish/Hindi. If English, reply in clear, spoken English.",
      "Persona: Helpful, humble, professional, friendly, and authentic. Never use bullet points, numbered lists, URLs, markdown, or corporate robotic jargon.",
      "Answer directly: If the caller asks a question, answer the question immediately.",
      "Facts: You represent Tarik Islam / Dezo.in AI product studio based in Bhubaneswar, Odisha. Website is dezo.in. Pricing depends on project scope.",
      "Do not falsely claim to be Tarik in person; you are his AI assistant taking the call.",
    ].join(" ");

    // Only include the last 6 turns to keep token budget minimal and latency low
    const recentTurns = ctx.turns.slice(-6);
    const conversationHistory: Array<{ role: "user" | "assistant"; text: string }> = recentTurns.map((turn) => ({
      role: turn.speaker === "caller" ? "user" : "assistant",
      text: turn.text,
    }));

    return {
      systemPrompt,
      conversationHistory,
    };
  }
}
