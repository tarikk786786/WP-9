import type { SpecialistSkill, SkillContext, SkillResponse } from "./types.ts";
import { webResearchPipeline, determineResearchMode } from "../web-intelligence/research/research-pipeline.ts";

export class ResearchSkill implements SpecialistSkill {
  public id = "research";
  public name = "Live Research & Web Intelligence Skill";
  public description = "Researches live external information including weather, news, and current events.";
  public priority = 70;

  public canHandle(ctx: SkillContext): boolean {
    const mode = determineResearchMode(ctx.normalizedText);
    return mode !== "CASUAL";
  }

  public async execute(ctx: SkillContext): Promise<SkillResponse | null> {
    const research = await webResearchPipeline.executeResearch(ctx.normalizedText);
    if (!research.hasLiveInformation) return null;

    let reply = research.answerSummary;
    if (research.citationText) {
      reply += research.citationText;
    }

    return {
      skillId: this.id,
      replyText: reply,
      confidence: 85,
    };
  }
}
