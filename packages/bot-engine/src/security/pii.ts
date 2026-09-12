/**
 * PII Protection Layer (Inspired by Microsoft Presidio)
 * Identifies, classifies, and tokenizes Personally Identifiable Information (PII)
 * before sending to external model providers.
 */

export type PiiType =
  | 'AADHAAR'
  | 'PAN'
  | 'CREDIT_CARD'
  | 'EMAIL'
  | 'PHONE'
  | 'IP_ADDRESS'
  | 'PASSPORT';

export interface PiiDetection {
  type: PiiType;
  value: string;
  redactedValue: string;
  start: number;
  end: number;
  confidence: number;
}

export interface PiiScanResult {
  hasPii: boolean;
  sanitizedText: string;
  detections: PiiDetection[];
}

export class PiiScanner {
  // Regex rules for common and Indian PII formats
  private rules: Array<{
    type: PiiType;
    regex: RegExp;
    validator?: (val: string) => boolean;
  }> = [
    // Indian Aadhaar Number: 12 digits, often formatted as 4-4-4
    {
      type: 'AADHAAR',
      regex: /\b[2-9]{1}[0-9]{3}[\s-]?[0-9]{4}[\s-]?[0-9]{4}\b/g,
      validator: (val) => {
        const clean = val.replace(/[\s-]/g, '');
        return clean.length === 12 && !/^(.)\1{11}$/.test(clean);
      },
    },
    // Indian PAN (Permanent Account Number): 5 letters + 4 digits + 1 letter
    {
      type: 'PAN',
      regex: /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/gi,
    },
    // Credit / Debit Card Numbers (Visa, MC, Amex, RuPay): 13-19 digits
    {
      type: 'CREDIT_CARD',
      regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12}|(508[5-9][0-9]{12}|6069[8-9][0-9]{11}|6521[5-9][0-9]{11}))\b/g,
      validator: (val) => {
        const digits = val.replace(/\D/g, '');
        return digits.length >= 13 && digits.length <= 19;
      },
    },
    // Email Addresses
    {
      type: 'EMAIL',
      regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    },
    // IPv4 Addresses
    {
      type: 'IP_ADDRESS',
      regex: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
    },
  ];

  /**
   * Scans text and replaces identified sensitive PII with tokens
   */
  public scan(text: string, options: { preserveContactPhone?: boolean } = {}): PiiScanResult {
    if (!text || typeof text !== 'string') {
      return { hasPii: false, sanitizedText: text, detections: [] };
    }

    const detections: PiiDetection[] = [];
    let sanitized = text;

    for (const rule of this.rules) {
      let match: RegExpExecArray | null;
      rule.regex.lastIndex = 0;

      while ((match = rule.regex.exec(text)) !== null) {
        const value = match[0];
        if (rule.validator && !rule.validator(value)) {
          continue;
        }

        const redacted = `<PII_REDACTED:${rule.type}>`;
        detections.push({
          type: rule.type,
          value,
          redactedValue: redacted,
          start: match.index,
          end: match.index + value.length,
          confidence: 0.95,
        });
      }
    }

    // Apply redaction in reverse index order to preserve offsets
    detections.sort((a, b) => b.start - a.start);
    for (const det of detections) {
      sanitized =
        sanitized.slice(0, det.start) + det.redactedValue + sanitized.slice(det.end);
    }

    return {
      hasPii: detections.length > 0,
      sanitizedText: sanitized,
      detections,
    };
  }
}

export const piiScanner = new PiiScanner();
