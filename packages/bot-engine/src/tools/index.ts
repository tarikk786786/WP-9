import type { ToolDefinition, ToolContext, ToolResult, ToolCategory } from './types.ts';
import { understandMessageTool } from './understanding/understand_message.ts';
import { normalizeTextTool } from './understanding/normalize_text.ts';
import { understandingTools } from './understanding/index.ts';
import { whatsappTools } from './whatsapp/index.ts';
import { memoryTools } from './memory/index.ts';
import { informationTools } from './information/index.ts';
import { productivityTools } from './productivity/index.ts';
import { businessTools } from './business/index.ts';
import { agentTools } from './agent/index.ts';
import { systemTools } from './system/index.ts';

export * from './types.ts';
export * from './understanding/understand_message.ts';
export * from './understanding/normalize_text.ts';
export * from './understanding/index.ts';
export * from './whatsapp/index.ts';
export * from './memory/index.ts';
export * from './information/index.ts';
export * from './productivity/index.ts';
export * from './business/index.ts';
export * from './agent/index.ts';
export * from './system/index.ts';

export class ToolRegistry {
  private tools: Map<string, ToolDefinition<any, any>> = new Map();

  constructor() {
    this.register(understandMessageTool);
    this.register(normalizeTextTool);
    for (const t of understandingTools) this.register(t);
    for (const t of whatsappTools) this.register(t);
    for (const t of memoryTools) this.register(t);
    for (const t of informationTools) this.register(t);
    for (const t of productivityTools) this.register(t);
    for (const t of businessTools) this.register(t);
    for (const t of agentTools) this.register(t);
    for (const t of systemTools) this.register(t);
  }

  public register(tool: ToolDefinition<any, any>) {
    this.tools.set(tool.name, tool);
  }

  public getTool(name: string): ToolDefinition<any, any> | undefined {
    return this.tools.get(name);
  }

  public listTools(category?: ToolCategory): Array<ToolDefinition<any, any>> {
    const all = Array.from(this.tools.values());
    if (!category) return all;
    return all.filter((t) => t.category === category);
  }

  public getAllTools(): Array<ToolDefinition<any, any>> {
    return Array.from(this.tools.values());
  }

  public async executeTool<TArgs = Record<string, unknown>, TResult = unknown>(
    name: string,
    args: TArgs,
    context: ToolContext = {}
  ): Promise<ToolResult<TResult>> {
    const tool = this.getTool(name);
    if (!tool) {
      return {
        success: false,
        error: `Tool '${name}' not found in registry. Available tools: ${Array.from(this.tools.keys()).join(', ')}`,
      };
    }
    try {
      return await tool.execute(args, context);
    } catch (err) {
      return {
        success: false,
        error: `Execution error in tool '${name}': ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  public formatToolsForLLM(): Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: {
        type: 'object';
        properties: Record<string, unknown>;
        required: string[];
      };
    };
  }> {
    return Array.from(this.tools.values()).map((tool) => {
      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      for (const p of tool.parameters) {
        properties[p.name] = {
          type: p.type,
          description: p.description,
          ...(p.enum ? { enum: p.enum } : {}),
        };
        if (p.required) required.push(p.name);
      }

      return {
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: {
            type: 'object',
            properties,
            required,
          },
        },
      };
    });
  }
}

export const globalToolRegistry = new ToolRegistry();
export const toolRegistry = globalToolRegistry;
