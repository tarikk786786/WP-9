export type OpenLoopState = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "EXPIRED";

export interface OpenLoop {
  id: string;
  chatId: string;
  description: string;
  state: OpenLoopState;
  createdAt: number;
  dueAt?: number;
  relatedTurnId?: string;
  nextAction?: string;
}

export class OpenLoopEngine {
  private loops: Map<string, OpenLoop[]> = new Map();

  public createLoop(loop: Omit<OpenLoop, "id" | "createdAt" | "state">): OpenLoop {
    const id = `loop_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const fullLoop: OpenLoop = {
      ...loop,
      id,
      state: "OPEN",
      createdAt: Date.now(),
    };

    const list = this.loops.get(loop.chatId) ?? [];
    list.push(fullLoop);
    this.loops.set(loop.chatId, list);
    return fullLoop;
  }

  public getActiveLoops(chatId: string): OpenLoop[] {
    const list = this.loops.get(chatId) ?? [];
    return list.filter((l) => l.state === "OPEN" || l.state === "IN_PROGRESS");
  }

  public resolveLoop(chatId: string, loopId: string): boolean {
    const list = this.loops.get(chatId) ?? [];
    const target = list.find((l) => l.id === loopId);
    if (target) {
      target.state = "RESOLVED";
      return true;
    }
    return false;
  }
}

export const openLoopEngine = new OpenLoopEngine();
