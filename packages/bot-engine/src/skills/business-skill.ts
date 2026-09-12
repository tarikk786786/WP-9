import type { SpecialistSkill, SkillContext, SkillResponse } from "./types.ts";

export class BusinessSkill implements SpecialistSkill {
  public id = "business";
  public name = "Tarik Islam Business & Engineering Skill";
  public description = "Provides grounded factual information about Tarik's development work, portfolio, rates, and timeline.";
  public priority = 80;

  public canHandle(ctx: SkillContext): boolean {
    const text = ctx.normalizedText.toLowerCase();
    return /\b(portfolio|website|site|hire|charge|rate|cost|price|available|project|build|work|consulting|bhubaneswar|tarikislam\.in)\b/i.test(
      text,
    );
  }

  public async execute(ctx: SkillContext): Promise<SkillResponse | null> {
    const text = ctx.normalizedText.toLowerCase();

    // 1. Portfolio / Website ask
    if (/\b(portfolio|website|site|kahan dekhun|sample)\b/i.test(text)) {
      return {
        skillId: this.id,
        replyText: "Aap mera portfolio aur live work dekh sakte hain: https://tarikislam.in",
        confidence: 95,
      };
    }

    // 2. Pricing ask
    if (/\b(charge|rate|cost|price|kitna lagega|kitne ka)\b/i.test(text)) {
      return {
        skillId: this.id,
        replyText: "Project ke scope aur timeline pe depend karta hai. Ek baar requirements bata dijiye, main exact quote share kar doonga.",
        confidence: 90,
      };
    }

    // 3. Availability ask
    if (/\b(available|kab tak|free ho|hire)\b/i.test(text)) {
      return {
        skillId: this.id,
        replyText: "Haan, main new projects discuss karne ke liye open hoon. Aap bataiye kya build karna chahte hain?",
        confidence: 90,
      };
    }

    return null;
  }
}
