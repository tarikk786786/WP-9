export interface ActionAuditRecord {
  actionId: string;
  traceId?: string;
  userId: string;
  chatId: string;
  action: string;
  targetResource: string;
  permissionDecision: string;
  policyDecision: string;
  confirmation: boolean;
  result: "SUCCESS" | "FAILED" | "PENDING_CONFIRMATION" | "BLOCKED";
  error?: string;
  createdAt: string;
}

export class ActionAuditStore {
  private records: ActionAuditRecord[] = [];
  private readonly maxRecords = 1000;

  public record(audit: Omit<ActionAuditRecord, "createdAt">): ActionAuditRecord {
    const fullRecord: ActionAuditRecord = {
      ...audit,
      createdAt: new Date().toISOString(),
    };

    if (this.records.length >= this.maxRecords) {
      this.records.shift();
    }
    this.records.push(fullRecord);
    return fullRecord;
  }

  public getRecent(limit = 20, chatId?: string): ActionAuditRecord[] {
    let list = this.records;
    if (chatId) {
      list = list.filter((r) => r.chatId === chatId);
    }
    return list.slice(-limit).reverse();
  }
}

export const actionAuditStore = new ActionAuditStore();
