export interface SkillContext {
  chatId: string;
  sender: string;
  fromName: string;
  rawText: string;
  normalizedText: string;
  intent: string;
  emotion: string;
  isDazy: boolean;
  history?: Array<{ role: "user" | "assistant"; text: string }>;
  verifiedFacts?: string[];
}

export interface SkillResponse {
  skillId: string;
  replyText: string;
  confidence: number; // 0 to 100
  requiresTools?: string[];
  suggestedAction?: string;
}

export interface SpecialistSkill {
  id: string;
  name: string;
  description: string;
  priority: number;
  canHandle(ctx: SkillContext): boolean;
  execute(ctx: SkillContext): Promise<SkillResponse | null>;
}
