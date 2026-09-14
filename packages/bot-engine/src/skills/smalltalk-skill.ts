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
      /^(hi|hello|hey|suno|kya haal|kaise ho|kaisi ho|wassup|yo|good morning|good night|gn|gm|bye|alvida|shukriya|thanks|thank you|salam|assalam|asalam|aoa|jazakallah|jazak allah)\b/i.test(
        text,
      ) && text.split(" ").length <= 5
    );
  }

  public async execute(ctx: SkillContext): Promise<SkillResponse | null> {
    const text = ctx.normalizedText.toLowerCase().trim();

    // Salam handling (adab: always reply with Walaikum Assalam)
    if (/^(assalam|asalam|salam|slaam|slm|aoa)\b/i.test(text)) {
      return {
        skillId: this.id,
        replyText: "Walaikum Assalam wa Rahmatullahi wa Barakatuh! Ji khairiyat? Boliye, main kis tarah madad kar sakta hoon?",
        confidence: 95,
      };
    }

    if (/^(hi|hello|hey|yo)\b/i.test(text)) {
      return {
        skillId: this.id,
        replyText: "Assalamu Alaikum! Ji boliye, sab khairiyat? Kis cheez mein madad chahiye?",
        confidence: 90,
      };
    }

    if (/^(kaise ho|kya haal|kaisi ho)/i.test(text)) {
      return {
        skillId: this.id,
        replyText: "Alhamdulillah main badhiya hoon, aap bataiye sab kaisa chal raha hai?",
        confidence: 95,
      };
    }

    if (/^(jazakallah|jazak allah)/i.test(text)) {
      return {
        skillId: this.id,
        replyText: "Wa Iyyakum! Khushi hui madad karke.",
        confidence: 95,
      };
    }

    if (/^(thanks|thank you|shukriya|dhanyawad)/i.test(text)) {
      return {
        skillId: this.id,
        replyText: "Arey koi baat nahi, bahut shukriya! Kabhi bhi bataiye agar kuch lage toh.",
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
      replyText: "Assalamu Alaikum! Ji boliye, sab theek thaak? Bataiye main kaise help kar sakta hoon?",
      confidence: 80,
    };
  }
}
