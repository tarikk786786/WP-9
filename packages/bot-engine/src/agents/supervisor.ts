import type { SpecialistAgent, AgentContext, AgentDecision, AgentRole } from "./types.ts";
import { SalesAgent } from "./sales.ts";
import { SupportAgent } from "./support.ts";
import { BillingAgent } from "./billing.ts";
import { BookingAgent } from "./booking.ts";
import { GeneralAgent } from "./general.ts";

export class SupervisorAgent {
  private specialists: Map<AgentRole, SpecialistAgent> = new Map();

  constructor() {
    this.register(new SalesAgent());
    this.register(new SupportAgent());
    this.register(new BillingAgent());
    this.register(new BookingAgent());
    this.register(new GeneralAgent());
  }

  public register(specialist: SpecialistAgent): void {
    this.specialists.set(specialist.role, specialist);
  }

  public getSpecialist(role: AgentRole): SpecialistAgent | undefined {
    return this.specialists.get(role);
  }

  /**
   * Route incoming context to the best matching specialist agent
   */
  public async orchestrate(context: AgentContext): Promise<AgentDecision> {
    const text = context.message.text.trim();
    const lower = text.toLowerCase();

    // 1. Direct handoff / emergency check
    if (/\b(talk to (a )?human|human agent|real agent|kisi insaan se|manager se baat)\b/i.test(lower)) {
      return {
        action: "handoff",
        handoffReason: "Explicit user request for human agent",
        text: "Ji, main Tarik bhai / support team ko notify kar raha hoon. Thoda waqt dijiye, direct connect karte hain.",
        confidence: 1.0,
        explanation: "Supervisor detected explicit human escalation",
      };
    }

    // 2. Priority check: Support & Troubleshooting (highest urgency)
    const supportAgent = this.specialists.get("support");
    if (supportAgent && supportAgent.canHandle(context)) {
      const decision = await supportAgent.execute(context);
      decision.targetAgent = "support";
      return decision;
    }

    // 3. Billing & Payments
    const billingAgent = this.specialists.get("billing");
    if (billingAgent && billingAgent.canHandle(context)) {
      const decision = await billingAgent.execute(context);
      decision.targetAgent = "billing";
      return decision;
    }

    // 4. Booking & Appointments
    const bookingAgent = this.specialists.get("booking");
    if (bookingAgent && bookingAgent.canHandle(context)) {
      const decision = await bookingAgent.execute(context);
      decision.targetAgent = "booking";
      return decision;
    }

    // 5. Sales & Services
    const salesAgent = this.specialists.get("sales");
    if (salesAgent && salesAgent.canHandle(context)) {
      const decision = await salesAgent.execute(context);
      decision.targetAgent = "sales";
      return decision;
    }

    // 6. General / Conversational fallback
    const generalAgent = this.specialists.get("general") || new GeneralAgent();
    const decision = await generalAgent.execute(context);
    decision.targetAgent = "general";
    return decision;
  }
}
