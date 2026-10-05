import type { CallPolicy, IncomingCall, UnknownCallerMode } from "../types.js";

export const DEFAULT_CALL_POLICY: CallPolicy = {
  autoAnswerEnabled: process.env.CALL_AUTO_ANSWER_ENABLED === "true",
  allowedContacts: [],
  blockedContacts: [],
  allowedGroups: [],
  unknownCallerMode: (process.env.CALL_UNKNOWN_CALLER_MODE as UnknownCallerMode) || "AUTO_ANSWER",
  businessHoursOnly: false,
  maxCallDurationMs: 5 * 60 * 1000, // 5 minutes max
  maxConcurrentCalls: 1, // Strict single-call limit to prevent worker CPU/bandwidth overload
  aiDisclosure: "Namaste, main AI assistant hoon. Main aapki baat sun kar help kar sakta hoon.",
  recordingEnabled: false, // Strictly disabled by default (Requirement 26)
  silenceTimeoutMs: 500,
  thinkingCooldownMs: 20_000,
};

export interface PolicyEvaluationResult {
  decision: "ANSWER" | "REJECT" | "IGNORE";
  reason: string;
}

export class CallPolicyManager {
  private policy: CallPolicy;

  constructor(policy: Partial<CallPolicy> = {}) {
    this.policy = { ...DEFAULT_CALL_POLICY, ...policy };
  }

  public getPolicy(): CallPolicy {
    return { ...this.policy };
  }

  public updatePolicy(patch: Partial<CallPolicy>): void {
    this.policy = { ...this.policy, ...patch };
  }

  public evaluateInboundCall(
    call: IncomingCall,
    currentActiveCalls: number
  ): PolicyEvaluationResult {
    const caller = call.callerPhone.replace(/\D/g, "");

    // 1. Group call safety check (Requirement 6: 1:1 voice calls only by default)
    if (call.isGroup && !this.policy.allowedGroups.includes(call.callerJid)) {
      return { decision: "REJECT", reason: "group_calls_not_allowed" };
    }

    // 2. Blocklist check (Requirement 6: Never bypass block lists)
    if (this.policy.blockedContacts.some((blocked) => caller.endsWith(blocked.replace(/\D/g, "")))) {
      return { decision: "REJECT", reason: "caller_in_blocklist" };
    }

    // 3. Concurrency check (Requirement 42: Protect against worker overload)
    if (currentActiveCalls >= this.policy.maxConcurrentCalls) {
      return { decision: "REJECT", reason: "max_concurrent_calls_reached" };
    }

    // 4. Global Auto-Answer check
    if (!this.policy.autoAnswerEnabled) {
      return { decision: "REJECT", reason: "auto_answer_disabled" };
    }

    // 5. Allowed contacts whitelist check (if configured)
    if (this.policy.allowedContacts.length > 0) {
      const isAllowed = this.policy.allowedContacts.some((allowed) =>
        caller.endsWith(allowed.replace(/\D/g, ""))
      );
      if (!isAllowed) {
        return { decision: "REJECT", reason: "caller_not_in_allowlist" };
      }
    }

    // 6. Unknown caller handling
    if (this.policy.unknownCallerMode === "REJECT" && !this.isKnownContact(caller)) {
      return { decision: "REJECT", reason: "unknown_caller_rejected" };
    }

    return { decision: "ANSWER", reason: "policy_approved" };
  }

  private isKnownContact(caller: string): boolean {
    return this.policy.allowedContacts.some((c) => caller.endsWith(c.replace(/\D/g, "")));
  }
}
