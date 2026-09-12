/**
 * Secret Scanner
 * Automatically detects and redacts credentials, API keys, JWT tokens,
 * database passwords, private keys, and authorization bearer tokens.
 */

export interface SecretDetection {
  type: string;
  masked: string;
  confidence: number;
}

export interface SecretScanResult {
  hasSecrets: boolean;
  sanitizedText: string;
  detections: SecretDetection[];
}

export class SecretScanner {
  private patterns: Array<{ type: string; regex: RegExp }> = [
    // OpenAI API keys: sk-... or sk-proj-...
    { type: 'OPENAI_API_KEY', regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/g },
    // Anthropic API keys: sk-ant-...
    { type: 'ANTHROPIC_API_KEY', regex: /\bsk-ant-[A-Za-z0-9_-]{32,}\b/g },
    // Groq API keys: gsk_...
    { type: 'GROQ_API_KEY', regex: /\bgsk_[A-Za-z0-9]{32,}\b/g },
    // GitHub personal access tokens: ghp_..., gho_..., github_pat_...
    { type: 'GITHUB_TOKEN', regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}\b/g },
    { type: 'GITHUB_PAT', regex: /\bgithub_pat_[A-Za-z0-9_]{50,}\b/g },
    // JSON Web Tokens (JWT)
    { type: 'JWT_TOKEN', regex: /\beyJ[A-Za-z0-9-_]{10,}\.eyJ[A-Za-z0-9-_]{10,}\.[A-Za-z0-9-_]{10,}\b/g },
    // Database Connection Strings (postgres://, mysql://, mongodb://) with passwords
    { type: 'DB_CONNECTION_STRING', regex: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^:]+:([^@]+)@[^\s]+/gi },
    // Bearer authorization headers
    { type: 'BEARER_TOKEN', regex: /Bearer\s+([A-Za-z0-9-_.]{20,})/gi },
    // Private Key blocks (RSA, EC, OPENSSH)
    { type: 'PRIVATE_KEY', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gi },
    // Generic worker secret or password assignments: password=xyz or secret=xyz
    { type: 'GENERIC_SECRET', regex: /(?:api[_-]?key|secret|password|access[_-]?token)\s*[:=]\s*["']?([A-Za-z0-9_-]{16,})["']?/gi },
  ];

  public scan(text: string): SecretScanResult {
    if (!text || typeof text !== 'string') {
      return { hasSecrets: false, sanitizedText: text, detections: [] };
    }

    const detections: SecretDetection[] = [];
    let sanitized = text;

    for (const p of this.patterns) {
      p.regex.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = p.regex.exec(text)) !== null) {
        const fullMatch = match[0];
        detections.push({
          type: p.type,
          masked: `<SECRET_REDACTED:${p.type}>`,
          confidence: 0.99,
        });
        sanitized = sanitized.replace(fullMatch, `<SECRET_REDACTED:${p.type}>`);
      }
    }

    return {
      hasSecrets: detections.length > 0,
      sanitizedText: sanitized,
      detections,
    };
  }
}

export const secretScanner = new SecretScanner();
