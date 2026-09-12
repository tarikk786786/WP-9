/**
 * Output Guard
 * Final outbound gate inspecting model-generated text.
 * Strictly verifies no credentials, API keys, internal system instructions,
 * or raw prompt dumps are leaked to the user.
 */

import { secretScanner } from './secrets.ts';

export interface OutputGuardResult {
  passed: boolean;
  sanitizedText: string;
  violations: string[];
}

export class OutputGuard {
  private forbiddenLeakPhrases = [
    /system\s+prompt:/i,
    /here\s+are\s+my\s+(?:instructions|rules):/i,
    /OPENAI_API_KEY/i,
    /GROQ_API_KEY/i,
    /SUPABASE_SERVICE_ROLE/i,
    /WORKER_API_SECRET/i,
  ];

  public evaluate(draftText: string): OutputGuardResult {
    return this.audit(draftText);
  }

  public audit(draftText: string): OutputGuardResult {
    if (!draftText || typeof draftText !== 'string') {
      return { passed: true, sanitizedText: '', violations: [] };
    }

    const violations: string[] = [];

    // 1. Scan for raw secret keys
    const secretScan = secretScanner.scan(draftText);
    let sanitized = secretScan.sanitizedText;
    if (secretScan.hasSecrets) {
      violations.push('Outbound draft contained sensitive credentials or keys');
    }

    // 2. Check for system instruction dump
    for (const phrase of this.forbiddenLeakPhrases) {
      if (phrase.test(draftText)) {
        violations.push(`Outbound draft leaked internal system instruction phrase: ${phrase.source}`);
        sanitized = sanitized.replace(phrase, '[REDACTED_SYSTEM_DIRECTIVE]');
      }
    }

    return {
      passed: violations.length === 0,
      sanitizedText: sanitized,
      violations,
    };
  }
}

export const outputGuard = new OutputGuard();
