/**
 * System Invariant Definitions and Verification
 * Formal assertions and checks for WP-9 Production Invariants.
 */

export interface SystemInvariantViolation {
  invariantId: string;
  severity: 'FATAL' | 'CRITICAL' | 'WARNING';
  description: string;
  details?: Record<string, unknown>;
  timestamp: number;
}

export class SystemInvariantChecker {
  public static readonly INVARIANTS = {
    INV_01_SINGLE_RESPONSE_PER_TURN: 'ONE TURN -> MAX ONE RESPONSE',
    INV_02_SINGLE_DELIVERY_PER_RESPONSE: 'ONE RESPONSE_ID -> MAX ONE DELIVERY',
    INV_03_OUTBOX_EXCLUSIVE_SEND_PATH: 'OUTBOX IS SOLE PERMITTED OUTBOUND SEND PATH',
    INV_04_STALE_RESPONSE_NEVER_DELIVERED: 'STALE RESPONSE (OBSOLETE VERSION) NEVER DELIVERED',
    INV_05_HISTORY_SYNC_NO_LIVE_REPLY: 'HISTORY SYNC NEVER PRODUCES CONVERSATIONAL REPLY',
    INV_06_MESSAGE_UPDATE_NO_LIVE_REPLY: 'MESSAGE UPDATE NEVER PRODUCES CONVERSATIONAL REPLY',
    INV_07_MEDIA_JOB_NO_DIRECT_REPLY: 'MEDIA PROCESSORS NEVER SEND MESSAGES DIRECTLY',
    INV_08_SINGLE_SOCKET_OWNER: 'ONE WHATSAPP SESSION -> EXACTLY ONE ACTIVE SOCKET OWNER',
    INV_09_CANONICAL_MESSAGE_IDENTITY: 'EVERY MESSAGE MUST HAVE EXACTLY ONE CANONICAL ID',
    INV_10_PRIVATE_MEMORY_NO_LEAK: 'PRIVATE MEMORIES CANNOT CROSS CONVERSATION SCOPES',
  };

  /**
   * Asserts that a turn does not receive a second committed response
   */
  public verifySingleResponsePerTurn(
    turnId: string,
    existingResponses: Array<{ responseId: string; turnId: string }>
  ): SystemInvariantViolation | null {
    const matches = existingResponses.filter((r) => r.turnId === turnId);
    if (matches.length > 1) {
      return {
        invariantId: 'INV_01_SINGLE_RESPONSE_PER_TURN',
        severity: 'FATAL',
        description: `Turn ${turnId} has ${matches.length} response commitments (Violation of 1 Response Invariant)`,
        details: { turnId, responseIds: matches.map((m) => m.responseId) },
        timestamp: Date.now(),
      };
    }
    return null;
  }

  /**
   * Asserts that an outbox item does not deliver if conversation version has advanced
   */
  public verifyResponseFreshness(
    responseVersion: number,
    currentConversationVersion: number
  ): SystemInvariantViolation | null {
    if (currentConversationVersion > responseVersion) {
      return {
        invariantId: 'INV_04_STALE_RESPONSE_NEVER_DELIVERED',
        severity: 'CRITICAL',
        description: `Response prepared for version ${responseVersion} is stale (current: ${currentConversationVersion})`,
        details: { responseVersion, currentConversationVersion },
        timestamp: Date.now(),
      };
    }
    return null;
  }
}

export const systemInvariantChecker = new SystemInvariantChecker();
