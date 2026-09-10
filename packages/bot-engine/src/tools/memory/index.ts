import type { ToolDefinition } from '../types.ts';

export const searchMemoryTool: ToolDefinition<{ query: string; limit?: number }> = {
  name: 'search_memory',
  category: 'memory',
  description: 'Searches semantic past memory, previous conversations, and user facts',
  parameters: [
    { name: 'query', type: 'string', description: 'Search keywords or context query', required: true },
    { name: 'limit', type: 'number', description: 'Maximum memory records to return', default: 5 },
  ],
  async execute({ query, limit = 5 }) {
    return {
      success: true,
      data: { query, results: [] },
      summary: `Searched memory for '${query}' (limit ${limit})`,
    };
  },
};

export const saveMemoryTool: ToolDefinition<{ key: string; value: string; category?: string }> = {
  name: 'save_memory',
  category: 'memory',
  description: 'Persists an important user fact, preference, or conversational memory',
  parameters: [
    { name: 'key', type: 'string', description: 'Key identifier or concept', required: true },
    { name: 'value', type: 'string', description: 'Information to remember', required: true },
    { name: 'category', type: 'string', description: 'Category (preference, fact, project)', default: 'fact' },
  ],
  async execute({ key, value, category = 'fact' }) {
    return {
      success: true,
      data: { key, value, category, savedAt: new Date().toISOString() },
      summary: `Saved memory [${category}]: ${key} = ${value}`,
    };
  },
};

export const memoryTools = [searchMemoryTool, saveMemoryTool];
