import type { SpecialistAgent, AgentContext, AgentDecision } from "./types.ts";

export class BillingAgent implements SpecialistAgent {
  readonly role = "billing" as const;

  public canHandle(context: AgentContext): boolean {
    const text = context.message.text.toLowerCase();
    const isBilling = /\b(payment|bill|invoice|receipt|transaction|upi|gpay|paytm|refund|paid|chalan|account details|bank)\b/i.test(text);
    return isBilling || context.intent === "billing";
  }

  public async execute(context: AgentContext): Promise<AgentDecision> {
    const text = context.message.text.trim();
    const lower = text.toLowerCase();

    // Check for payment status inquiry
    if (/\b(status|verify|check|ho gaya|received|mil gaya)\b/i.test(lower)) {
      return {
        action: "reply",
        text: "Payment confirmation ke liye transaction ID ya screenshot share kar dijiye. Bank statement verify karke confirmation message bhej deta hoon.",
        confidence: 0.92,
        explanation: "Requested payment transaction proof for verification",
      };
    }

    // Check for invoice request
    if (/\b(invoice|bill|receipt|gst)\b/i.test(lower)) {
      return {
        action: "reply",
        text: "GST invoice ke liye aapka registered business name aur GSTIN number chahiye hoga. Details share kar dijiye, invoice generate karwa dete hain.",
        confidence: 0.90,
        explanation: "Invoice requirement collection",
      };
    }

    // Payment details / link request
    if (/\b(how to pay|kahan pay karein|qr|upi id|bank details|link)\b/i.test(lower)) {
      return {
        action: "reply",
        text: "Official payments verified UPI ya bank transfer ke through accept hote hain. Invoice amount confirm hote hi verified payment link provide kar di jayegi.",
        confidence: 0.90,
        explanation: "Provided secure payment policy guidance",
      };
    }

    return {
      action: "reply",
      text: "Billing aur accounts related query ke liye details batayein, accounts verify karke update kar denge.",
      confidence: 0.85,
      explanation: "Default billing inquiry response",
    };
  }
}
