import {
  recordResponseCommit,
  updateResponseCommitStatus,
  getResponseCommitByTurn,
  type ResponseCommitRecord,
} from "@bot/database";
import type { ResponsePlan } from "./response-planner.ts";

export interface CommittedResponse {
  responseId: string;
  turnId: string;
  chatId: string;
  text: string;
  status: ResponseCommitRecord["status"];
  intent: string;
  modelId?: string;
  plan: ResponsePlan;
  committedAt: number;
}

export class ResponseCommitManager {
  private inMemoryCommits: Map<string, CommittedResponse> = new Map();
  private inMemoryByTurn: Map<string, CommittedResponse> = new Map();

  /**
   * Commits a final response for a turn.
   * Guarantees that each turnId maps to EXACTLY ONE responseId.
   */
  public async commitResponse(params: {
    turnId: string;
    chatId: string;
    plan: ResponsePlan;
    finalText: string;
  }): Promise<{ committedResponse: CommittedResponse; isDuplicateAttempt: boolean }> {
    // 1. In-memory check
    const existing = this.inMemoryByTurn.get(params.turnId);
    if (existing) {
      return { committedResponse: existing, isDuplicateAttempt: true };
    }

    // 2. Database check
    const dbExisting = await getResponseCommitByTurn(params.turnId);
    if (dbExisting) {
      const existingCommitted: CommittedResponse = {
        responseId: dbExisting.responseId,
        turnId: dbExisting.turnId,
        chatId: dbExisting.chatId,
        text: dbExisting.finalText,
        status: dbExisting.status,
        intent: dbExisting.intent || params.plan.intent,
        modelId: dbExisting.modelId,
        plan: (dbExisting.plan as unknown as ResponsePlan) || params.plan,
        committedAt: dbExisting.committedAt || Date.now(),
      };
      this.inMemoryCommits.set(existingCommitted.responseId, existingCommitted);
      this.inMemoryByTurn.set(existingCommitted.turnId, existingCommitted);
      return { committedResponse: existingCommitted, isDuplicateAttempt: true };
    }

    const cleanFinalText = (params.finalText || "").trim() || "Ji boliye, main sun raha hoon.";

    // 3. Atomically record commit
    const record: ResponseCommitRecord = {
      responseId: params.plan.responseId,
      turnId: params.turnId,
      chatId: params.chatId,
      status: "COMMITTED",
      finalText: cleanFinalText,
      intent: params.plan.intent,
      modelId: params.plan.modelUsed,
      plan: params.plan as unknown as Record<string, unknown>,
      attemptCount: 0,
    };

    const result = await recordResponseCommit(record);
    const rec = result.existing || record;

    const committedResponse: CommittedResponse = {
      responseId: rec.responseId,
      turnId: rec.turnId,
      chatId: rec.chatId,
      text: rec.finalText,
      status: rec.status,
      intent: rec.intent || params.plan.intent,
      modelId: rec.modelId,
      plan: params.plan,
      committedAt: rec.committedAt || Date.now(),
    };

    this.inMemoryCommits.set(committedResponse.responseId, committedResponse);
    this.inMemoryByTurn.set(committedResponse.turnId, committedResponse);

    return {
      committedResponse,
      isDuplicateAttempt: !result.committed,
    };
  }

  public async markSending(responseId: string) {
    const mem = this.inMemoryCommits.get(responseId);
    if (mem) mem.status = "SENDING";
    await updateResponseCommitStatus(responseId, "SENDING");
  }

  public async markSent(responseId: string) {
    const mem = this.inMemoryCommits.get(responseId);
    if (mem) mem.status = "SENT";
    await updateResponseCommitStatus(responseId, "SENT");
  }

  public async markFailed(responseId: string, error?: string) {
    const mem = this.inMemoryCommits.get(responseId);
    if (mem) mem.status = "RETRY_PENDING";
    await updateResponseCommitStatus(responseId, "RETRY_PENDING", error);
  }

  public clear() {
    this.inMemoryCommits.clear();
    this.inMemoryByTurn.clear();
  }
}

export const responseCommitManager = new ResponseCommitManager();
