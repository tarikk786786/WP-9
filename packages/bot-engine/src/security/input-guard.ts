/**
 * Input Guard
 * Frontline gateway for all untrusted inbound user text.
 * Performs prompt-injection detection, PII tokenization, and risk assessment.
 */

import { promptInjectionDetector, type PromptInjectionCheckResult } from './prompt-injection.ts';
import { piiScanner, type PiiScanResult } from './pii.ts';
import { secretScanner, type SecretScanResult } from './secrets.ts';

export interface InputGuardEvaluation {
  allowed: boolean;
  sanitizedText: string;
  originalText: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  violations: string[];
  injectionCheck: PromptInjectionCheckResult;
  piiCheck: PiiScanResult;
  secretCheck: SecretScanResult;
}

export class InputGuard {
  public evaluate(rawText: string, context: { senderId?: string; isSpecialContact?: boolean } = {}): InputGuardEvaluation {
    const text = (rawText || '').trim();
    const violations: string[] = [];
    let riskLevel: InputGuardEvaluation['riskLevel'] = 'LOW';
    let allowed = true;

    // 1. Prompt Injection Scan
    const injectionCheck = promptInjectionDetector.detect(text);
    if (injectionCheck.isInjection) {
      violations.push(`Prompt Injection detected (${injectionCheck.category})`);
      riskLevel = 'CRITICAL';
      // Injections that attempt system leak or override are blocked from model execution
      allowed = false;
    }

    // 2. Secret Scan
    const secretCheck = secretScanner.scan(text);
    if (secretCheck.hasSecrets) {
      violations.push('Sensitive secret or key pattern detected');
      if (riskLevel !== 'CRITICAL') riskLevel = 'HIGH';
    }

    // 3. PII Scan (tokenize for model privacy)
    const piiCheck = piiScanner.scan(secretCheck.sanitizedText);
    if (piiCheck.hasPii) {
      if (riskLevel === 'LOW') riskLevel = 'MEDIUM';
    }

    // The sanitized text has secrets removed and PII tokenized
    const sanitizedText = piiCheck.sanitizedText;

    return {
      allowed,
      sanitizedText,
      originalText: text,
      riskLevel,
      violations,
      injectionCheck,
      piiCheck,
      secretCheck,
    };
  }
}

export const inputGuard = new InputGuard();
