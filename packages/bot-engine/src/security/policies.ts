/**
 * Security Policies & Threat Thresholds
 */

export interface SecurityPolicy {
  blockPromptInjections: boolean;
  redactPiiBeforeModel: boolean;
  redactSecretsFromLogs: boolean;
  enforceSsrfProtection: boolean;
  maxContentLengthBytes: number;
}

export const DEFAULT_SECURITY_POLICY: SecurityPolicy = {
  blockPromptInjections: true,
  redactPiiBeforeModel: true,
  redactSecretsFromLogs: true,
  enforceSsrfProtection: true,
  maxContentLengthBytes: 1024 * 1024, // 1MB text limit
};
