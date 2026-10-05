import type { ToolDefinition, ToolContext, ToolResult, ToolCategory } from "./types.ts";
import { ToolRegistry } from "./index.ts";
import { policyEngine, type PolicyContext } from "../authorization/policy-engine.ts";
import { toolGuard } from "../security/tool-guard.ts";
import { brainTelemetry } from "../conversation-engine/telemetry.ts";

export interface GatewayExecutionOptions {
  assistantId?: string;
  conversationId?: string;
  turnId?: string;
  policyContext?: PolicyContext;
  timeoutMs?: number;
}

export class UnifiedToolGateway {
  private static instance: UnifiedToolGateway | null = null;
  private registry: ToolRegistry | null = null;

  constructor(registry?: ToolRegistry) {
    if (registry) {
      this.registry = registry;
    }
  }

  public static getInstance(): UnifiedToolGateway {
    if (!UnifiedToolGateway.instance) {
      UnifiedToolGateway.instance = new UnifiedToolGateway();
    }
    return UnifiedToolGateway.instance;
  }

  public getRegistry(): ToolRegistry {
    if (!this.registry) {
      this.registry = new ToolRegistry();
    }
    return this.registry;
  }

  /**
   * Authoritative execution pipeline:
   * Policy / Auth check -> Execution with timeout -> ToolGuard output sanitization -> Audit telemetry
   */
  public async executeTool<TArgs = Record<string, unknown>, TResult = unknown>(
    name: string,
    args: TArgs,
    context: ToolContext = {},
    options: GatewayExecutionOptions = {}
  ): Promise<ToolResult<TResult>> {
    const startTime = Date.now();

    // 1. Policy & Authorization Pre-flight check
    const policyCtx: PolicyContext = options.policyContext || {
      botEnabled: true,
      conversationStatus: "bot",
    };

    const policyDecision = policyEngine.evaluate(
      {
        subject: { id: options.assistantId || "assistant", role: "ai_agent" },
        action: "execute_tool",
        resource: { id: name, type: "tool" },
      },
      policyCtx
    );

    if (!policyDecision.allowed) {
      return {
        success: false,
        error: `Tool execution blocked by policy: ${policyDecision.reason}`,
      };
    }

    // 2. Fetch Tool
    const registry = this.getRegistry();
    const tool = registry.getTool(name);
    if (!tool) {
      return {
        success: false,
        error: `Tool '${name}' not found. Available tools: ${registry
          .getAllTools()
          .map((t) => t.name)
          .join(", ")}`,
      };
    }

    // 3. Execution with Timeout
    const limit = options.timeoutMs ?? 5000;
    try {
      const rawResult = await Promise.race([
        tool.execute(args, context),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Tool '${name}' timed out after ${limit}ms`)), limit)
        ),
      ]);

      // 4. Output Guard Sanitization (Prompt injection & Secret redaction)
      if (rawResult.success && rawResult.data !== undefined) {
        const sanitized = toolGuard.sanitizeOutput(name, rawResult.data);
        if (!sanitized.allowed) {
          return {
            success: false,
            error: `Tool output rejected by security guard (${sanitized.warnings.join(", ")})`,
          };
        }
        rawResult.data = sanitized.sanitizedResult as TResult;
      }

      const durationMs = Date.now() - startTime;
      if (options.turnId) {
        brainTelemetry.recordToolCall(options.turnId, {
          tool: name,
          args: args as Record<string, unknown>,
          result: rawResult.data,
          durationMs,
          success: rawResult.success,
        });
      }

      return rawResult as ToolResult<TResult>;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      if (options.turnId) {
        brainTelemetry.recordToolCall(options.turnId, {
          tool: name,
          args: args as Record<string, unknown>,
          result: null,
          durationMs,
          success: false,
        });
      }
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export const toolGateway = UnifiedToolGateway.getInstance();
