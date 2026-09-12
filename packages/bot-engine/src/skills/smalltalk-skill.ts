import type { SpecialistSkill, SkillContext, SkillResponse } from "./types.ts";

export class SmalltalkSkill implements SpecialistSkill {
  public id = "smalltalk";
  public name = "Smalltalk & Casual Conversational Skill";
  public description = "Handles greetings, brief acknowledgments, check-ins, and polite social closures.";
  public priority = 50;

  public canHandle(ctx: SkillContext): boolean {
    const text = ctx.normalizedText.toLowerCase().trim();
    if (ctx.isDazy) return false; // DAZY profile handles romantic & intimate pings with custom warmth
    return (
      /^(hi|hello|hey|suno|kya haal|kaise ho|kaisi ho|wassup|yo|good morning|good night|gn|gm|bye|alvida|shukriya|thanks|thank you)\b/i.test(
        text,
      ) && text.split(" ").length <= 4
    );
  }

  public async execute(ctx: SkillContext): Promise<SkillResponse | null> {
    const text = ctx.normalizedText.toLowerCase().trim();

    if (/^(hi|hello|hey|yo)\b/i.test(text)) {
      return {
        skillId: this.id,
        replyText: "Haan ji, boliye! Main sun raha hoon.",
        confidence: 90,
      };
    }

    if (/^(kaise ho|kya haal|kaisi ho)/i.test(text)) {
      return {
        skillId: this.id,
        replyText: "Main badhiya hoon, aap bataiye sab kaisa chal raha hai?",
        confidence: 90,
      };
    }

    if (/^(thanks|thank you|shukriya|dhanyawad)/i.test(text)) {
      return {
        skillId: this.id,
        replyText: "Arey koi baat nahi! Kabhi bhi bataiye agar kuch lage toh.",
        confidence: 95,
      };
    }

    if (/^(gn|good night)\b/i.test(text)) {
      return {
        skillId: this.id,
        replyText: "Good night, achhe se aaram kijiye!",
        confidence: 95,
      };
    }

    return {
      skillId: this.id,
      replyText: "Haanji, batayein kya madad kar sakta hoon?",
      confidence: 80,
    };
  }
}
