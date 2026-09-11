export interface ToolExecutionResult {
  toolName: string;
  success: boolean;
  result: string | null;
  error?: string;
  executionTimeMs: number;
}

export type ToolExecutor = (name: string, args: Record<string, unknown>) => Promise<string | null>;

export class ToolRunner {
  private executor: ToolExecutor | null = null;
  private readonly defaultTimeoutMs: number;

  constructor(defaultTimeoutMs = 4000) {
    this.defaultTimeoutMs = defaultTimeoutMs;
  }

  public setExecutor(executor: ToolExecutor) {
    this.executor = executor;
  }

  public async runTool(name: string, args: Record<string, unknown>, timeoutMs?: number): Promise<ToolExecutionResult> {
    const start = Date.now();
    if (!this.executor) {
      return {
        toolName: name,
        success: false,
        result: null,
        error: "No tool executor registered",
        executionTimeMs: 0,
      };
    }

    const limit = timeoutMs ?? this.defaultTimeoutMs;

    try {
      const result = await Promise.race([
        this.executor(name, args),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error(`Tool ${name} timed out after ${limit}ms`)), limit)
        ),
      ]);

      return {
        toolName: name,
        success: true,
        result,
        executionTimeMs: Date.now() - start,
      };
    } catch (err) {
      return {
        toolName: name,
        success: false,
        result: null,
        error: err instanceof Error ? err.message : String(err),
        executionTimeMs: Date.now() - start,
      };
    }
  }
}

export const toolRunner = new ToolRunner();
