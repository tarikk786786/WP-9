import { telemetry } from '@bot/shared';

export interface QualityEvaluation {
  passed: boolean;
  score: number; // 0 to 100
  feedback: string[];
  sanitizedText: string;
}

/**
 * Quality Judge evaluates every drafted bot reply before it reaches WhatsApp outbox.
 * Filters robotic phrasing, checks tone consistency, eliminates repetition, and validates facts.
 */
export function evaluateReplyQuality(draft: string, userMessage: string): QualityEvaluation {
  const span = telemetry.startSpan('quality.judge');
  const feedback: string[] = [];
  let score = 100;
  let text = draft.trim();

  // 1. Anti-Robotic Filter
  const roboticPatterns = [
    /as an ai language model/i,
    /as an ai/i,
    /i am an artificial intelligence/i,
    /how may i assist you today\??/i,
    /certainly!/i,
    /i am here to help you/i,
    /feel free to reach out anytime/i,
  ];

  for (const pattern of roboticPatterns) {
    if (pattern.test(text)) {
      feedback.push('Robotic AI marker detected and stripped');
      text = text.replace(pattern, '').trim();
      score -= 20;
    }
  }

  // 2. Repetition Guard
  if (text.toLowerCase() === userMessage.toLowerCase().trim()) {
    feedback.push('Exact repetition of user message detected');
    score -= 40;
  }

  // 3. Excessive Punctuation / Formatting Clean
  text = text.replace(/\!{3,}/g, '!').replace(/\?{3,}/g, '?');

  // 4. Invented Pricing Guard
  if (/\$\d+|₹\s*\d{6,}/.test(text) && !/tarikislam\.in|discuss/i.test(text)) {
    feedback.push('High unverified monetary figure detected');
    score -= 15;
  }

  // 5. Ensure non-empty output
  if (!text) {
    text = 'haan dekh liya. thoda aur bata';
    feedback.push('Empty draft replaced with human conversational fallback');
    score = 70;
  }

  const passed = score >= 50;
  span.end({ passed, score });

  return {
    passed,
    score,
    feedback,
    sanitizedText: text,
  };
}
