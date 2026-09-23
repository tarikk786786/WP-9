import type { SpecialistAgent, AgentContext, AgentDecision } from "./types.ts";

export class SalesAgent implements SpecialistAgent {
  readonly role = "sales" as const;

  public canHandle(context: AgentContext): boolean {
    const text = context.message.text.toLowerCase();
    const isPricing = /\b(price|pricing|rate|charges|cost|budget|kitna lagega|paisa|fees|quote|quotation)\b/i.test(text);
    const isService = /\b(website|web|app|apps|application|develop|development|software|hire|project|forensics|security|audit|build|redesign|portfolio|ecommerce|crm|saas)\b/i.test(text);
    return isPricing || isService || context.intent === "sales" || context.intent === "pricing";
  }

  public async execute(context: AgentContext): Promise<AgentDecision> {
    const text = context.message.text.trim();
    const lower = text.toLowerCase();

    // Check if query is about specific services
    if (/\b(forensic|evidence|cyber|investigation)\b/i.test(lower)) {
      return {
        action: "reply",
        text: "Digital forensics aur cyber investigation ke cases hum formal process ke sath handle karte hain. Aap issue ka brief share kar dijiye, main scope review kar leta hoon.",
        confidence: 0.95,
        explanation: "Addressed digital forensics / cyber inquiry with authoritative, professional tone",
      };
    }

    if (/\b(website|web app|software|build|redesign|landing page)\b/i.test(lower)) {
      if (/\b(price|cost|rate|kitna)\b/i.test(lower)) {
        return {
          action: "reply",
          text: "Website aur software development ka cost features aur timeline pe depend karta hai. Standard web projects usually ₹15k se start hote hain. Aapki specific requirement kya hai?",
          confidence: 0.92,
          explanation: "Provided transparent ballpark pricing and invited requirement details",
        };
      }

      return {
        action: "reply",
        text: "Ji bilkul, software aur web development hum DEZO Studio mein actively build karte hain. Recent work tarikislam.in pe dekh sakte hain. Aapka project kis type ka hai?",
        confidence: 0.90,
        explanation: "Shared portfolio anchor and asked about project scope",
      };
    }

    // General pricing inquiry
    if (/\b(price|pricing|rate|cost|budget)\b/i.test(lower)) {
      return {
        action: "reply",
        text: "Pricing project ke exact scope aur deliverables pe depend karti hai. Requirement batayein, main clear estimate de deta hoon.",
        confidence: 0.88,
        explanation: "General pricing inquiry handled honestly without fake commitments",
      };
    }

    return {
      action: "reply",
      text: "Ji batayein, project ya development ke baare mein kya discuss karna chahte hain?",
      confidence: 0.85,
      explanation: "Default sales inquiry response",
    };
  }
}
