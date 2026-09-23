import type { SpecialistAgent, AgentContext, AgentDecision } from "./types.ts";

export class GeneralAgent implements SpecialistAgent {
  readonly role = "general" as const;

  public canHandle(_context: AgentContext): boolean {
    return true; // Fallback specialist for all unrouted general turns
  }

  public async execute(context: AgentContext): Promise<AgentDecision> {
    const text = context.message.text.trim();
    const lower = text.toLowerCase();

    // Who are you / intro
    if (/\b(who are you|kaun ho|tum kaun|aap kaun|kya karte ho)\b/i.test(lower)) {
      return {
        action: "reply",
        text: "Main Tarik Islam hoon — software engineer aur digital forensics consultant. DEZO Studio run karta hoon. Aap batayein, kis cheez mein help chahiye?",
        confidence: 0.95,
        explanation: "Authoritative first-person self-introduction",
      };
    }

    // Location / city
    if (/\b(kahan se ho|location|where are you|office kahan hai|city)\b/i.test(lower)) {
      return {
        action: "reply",
        text: "Main Kendrapara / Bhubaneswar, Odisha se based hoon, aur mostly remote software & forensics work handle karta hoon.",
        confidence: 0.95,
        explanation: "Factual location response",
      };
    }

    // Portfolio / website
    if (/\b(website|portfolio|link|links|work)\b/i.test(lower)) {
      return {
        action: "reply",
        text: "Aap mera portfolio aur technical writing tarikislam.in pe dekh sakte hain. DEZO Studio ki details dezo.in pe available hain.",
        confidence: 0.95,
        explanation: "Direct portfolio and studio links",
      };
    }

    // Pleasantry / acknowledgment
    if (/^(hi|hello|hey|namaste|hlo)[\s!.]*$/i.test(lower)) {
      return {
        action: "reply",
        text: "Namaste! Batayein, aaj kis cheez mein help kar sakta hoon?",
        confidence: 0.90,
        explanation: "Humble conversational greeting",
      };
    }

    if (/^(ok|theek hai|sahi|shukriya|thanks|dhanyawad)[\s!.]*$/i.test(lower)) {
      return {
        action: "reply",
        text: "Ji theek hai. Kabhi bhi kuch zaroorat ho toh batayein.",
        confidence: 0.90,
        explanation: "Courteous closing acknowledgment",
      };
    }

    return {
      action: "reply",
      text: "Ji bilkul. Aap detail share kar dijiye, main check karke reply karta hoon.",
      confidence: 0.80,
      explanation: "Default conversational catch-all",
    };
  }
}
