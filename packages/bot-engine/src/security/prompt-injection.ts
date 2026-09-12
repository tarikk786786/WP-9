/**
 * Prompt Injection & Jailbreak Detector
 * Protects against direct and indirect prompt injections, jailbreak attempts,
 * instruction overrides, and developer mode escalations.
 */

export interface PromptInjectionCheckResult {
  isInjection: boolean;
  score: number; // 0 to 1
  category?: 'jailbreak' | 'instruction_override' | 'system_leak' | 'roleplay_exploit';
  matchedPatterns: string[];
}

const INJECTION_PATTERNS: Array<{
  pattern: RegExp;
  category: PromptInjectionCheckResult['category'];
  weight: number;
}> = [
  // Direct instruction overrides
  {
    pattern: /(?:ignore|disregard|forget|bypass)\s+(?:all\s+)?(?:previous|prior|above|system|safety|security)?\s*(?:instructions|prompts|rules|guidelines|commands|directives)/i,
    category: 'instruction_override',
    weight: 0.95,
  },
  {
    pattern: /from\s+now\s+on[,\s]+(?:you\s+must|you\s+are|act\s+as|roleplay\s+as)\s+(?:a|an)?\s*(?:dan|unfiltered|jailbroken|evil|unrestricted)/i,
    category: 'jailbreak',
    weight: 0.9,
  },
  {
    pattern: /(?:reveal|dump|show|output|print|display)\s+(?:your\s+)?(?:system\s+prompt|system\s+directive|initial\s+instructions|core\s+directive|secret\s+keys)/i,
    category: 'system_leak',
    weight: 0.95,
  },
  {
    pattern: /(?:reveal|dump|show|print|leak)\s+(?:.*)?(?:api\s*key|openai\s*key|secret|credential|password)/i,
    category: 'system_leak',
    weight: 0.95,
  },
  {
    pattern: /(?:system\s+override|system\s+reset|admin\s+override)/i,
    category: 'instruction_override',
    weight: 0.9,
  },
  {
    pattern: /(?:do\s+anything\s+now|developer\s+mode\s+enabled|aim\s+mode|unlocked\s+mode)/i,
    category: 'jailbreak',
    weight: 0.85,
  },
  {
    pattern: /(?:you\s+are\s+no\s+longer\s+bound\s+by|rules\s+are\s+now\s+suspended)/i,
    category: 'instruction_override',
    weight: 0.9,
  },
  {
    pattern: /\[\s*(?:system|system_instruction|admin_instruction|ai_instruction)\s*\]/i,
    category: 'instruction_override',
    weight: 0.8,
  },
  // Indirect injection markers in scraped content
  {
    pattern: /(?:IMPORTANT\s+AI\s+INSTRUCTION|AI\s+ASSISTANT\s+NOTICE):\s*(?:ignore|send|reveal|execute)/i,
    category: 'instruction_override',
    weight: 0.95,
  },
  {
    pattern: /(?:new\s+rule|system\s+update):\s*(?:send|transfer|wipe|override)/i,
    category: 'instruction_override',
    weight: 0.85,
  },
];

export class PromptInjectionDetector {
  public detect(text: string): PromptInjectionCheckResult {
    if (!text || typeof text !== 'string') {
      return { isInjection: false, score: 0, matchedPatterns: [] };
    }

    const matchedPatterns: string[] = [];
    let maxScore = 0;
    let detectedCategory: PromptInjectionCheckResult['category'];

    for (const item of INJECTION_PATTERNS) {
      if (item.pattern.test(text)) {
        matchedPatterns.push(item.pattern.source);
        if (item.weight > maxScore) {
          maxScore = item.weight;
          detectedCategory = item.category;
        }
      }
    }

    return {
      isInjection: maxScore >= 0.75,
      score: maxScore,
      category: detectedCategory,
      matchedPatterns,
    };
  }
}

export const promptInjectionDetector = new PromptInjectionDetector();
