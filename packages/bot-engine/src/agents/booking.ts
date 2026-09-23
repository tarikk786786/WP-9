import type { SpecialistAgent, AgentContext, AgentDecision } from "./types.ts";

export class BookingAgent implements SpecialistAgent {
  readonly role = "booking" as const;

  public canHandle(context: AgentContext): boolean {
    const text = context.message.text.toLowerCase();
    const isBooking = /\b(meeting|call|schedule|appointment|slot|kal milein|baat karein|free kab ho|time milega|zoom|google meet)\b/i.test(text);
    return isBooking || context.intent === "booking";
  }

  public async execute(context: AgentContext): Promise<AgentDecision> {
    const text = context.message.text.trim();
    const lower = text.toLowerCase();

    if (/\b(kal|tomorrow)\b/i.test(lower)) {
      return {
        action: "reply",
        text: "Kal afternoon mein 3:00 PM se 5:00 PM ke beech 20-minute call schedule kar sakte hain. Kya 4:00 PM aapke liye convenient rahega?",
        confidence: 0.92,
        explanation: "Offered available slot for tomorrow",
      };
    }

    if (/\b(zoom|meet|google meet)\b/i.test(lower)) {
      return {
        action: "reply",
        text: "Ji, Google Meet ya phone call dono arrange ho sakta hai. Aapka preferred time slot batayein, invite bhej dete hain.",
        confidence: 0.90,
        explanation: "Inquired about meeting platform and preferred time",
      };
    }

    return {
      action: "reply",
      text: "Discussion ke liye call schedule kar sakte hain. Aap weekday afternoon ka koi preferred slot batayein.",
      confidence: 0.88,
      explanation: "General booking prompt",
    };
  }
}
