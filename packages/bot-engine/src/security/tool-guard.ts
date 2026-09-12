/**
 * Tool Result Guard
 * Sanitizes tool outputs and validates tool execution arguments
 * to prevent tool poisoning and parameter tampering.
 */

import { secretScanner } from './secrets.ts';
import { promptInjectionDetector } from './prompt-injection.ts';

export interface ToolGuardResult {
  allowed: boolean;
  sanitizedResult: unknown;
  warnings: string[];
}

export class ToolGuard {
  public sanitizeOutput(toolName: string, rawOutput: unknown): ToolGuardResult {
    const warnings: string[] = [];

    if (rawOutput === null || rawOutput === undefined) {
      return { allowed: true, sanitizedResult: rawOutput, warnings };
    }

    if (typeof rawOutput === 'string') {
      // Check for prompt injection in tool output
      const injection = promptInjectionDetector.detect(rawOutput);
      if (injection.isInjection) {
        warnings.push(`Tool [${toolName}] output contained instruction injection`);
      }

      // Check for credential leaks in tool output
      const secrets = secretScanner.scan(rawOutput);
      return {
        allowed: !injection.isInjection,
        sanitizedResult: secrets.sanitizedText,
        warnings,
      };
    }

    if (typeof rawOutput === 'object') {
      try {
        const jsonStr = JSON.stringify(rawOutput);
        const secrets = secretScanner.scan(jsonStr);
        return {
          allowed: true,
          sanitizedResult: JSON.parse(secrets.sanitizedText),
          warnings,
        };
      } catch {
        return { allowed: true, sanitizedResult: rawOutput, warnings };
      }
    }

    return { allowed: true, sanitizedResult: rawOutput, warnings };
  }
}

export const toolGuard = new ToolGuard();
