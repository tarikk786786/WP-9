import type { SpecialistSkill, SkillContext, SkillResponse } from "./types.ts";
import { SmalltalkSkill } from "./smalltalk-skill.ts";
import { BusinessSkill } from "./business-skill.ts";
import { ResearchSkill } from "./research-skill.ts";

export class SkillsRegistry {
  private skills: SpecialistSkill[] = [];

  constructor() {
    this.register(new BusinessSkill());
    this.register(new ResearchSkill());
    this.register(new SmalltalkSkill());
  }

  public register(skill: SpecialistSkill): void {
    this.skills.push(skill);
    this.skills.sort((a, b) => b.priority - a.priority);
  }

  public async evaluate(ctx: SkillContext): Promise<SkillResponse | null> {
    for (const skill of this.skills) {
      if (skill.canHandle(ctx)) {
        try {
          const res = await skill.execute(ctx);
          if (res && res.replyText) {
            return res;
          }
        } catch (err) {
          console.warn(`[SkillsRegistry] Skill ${skill.name} failed:`, err);
        }
      }
    }
    return null;
  }
}

export const skillsRegistry = new SkillsRegistry();
