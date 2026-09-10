import type { ToolDefinition } from '../types.ts';
import { aiCircuitBreaker, whatsappCircuitBreaker } from '../../orchestrate/circuit-breaker.ts';
import { messageOutbox } from '../../orchestrate/outbox.ts';
import { connectionStateMachine } from '../../orchestrate/state-machine.ts';

export const workerStatusTool: ToolDefinition<Record<string, never>> = {
  name: 'worker_status',
  category: 'system',
  description: 'Returns real-time connection state, circuit breaker status, and outbox metrics',
  parameters: [],
  async execute() {
    return {
      success: true,
      data: {
        connection: connectionStateMachine.getSnapshot(),
        circuits: {
          ai: aiCircuitBreaker.getSnapshot(),
          whatsapp: whatsappCircuitBreaker.getSnapshot(),
        },
        outbox: messageOutbox.getSnapshot(),
      },
      summary: `State: ${connectionStateMachine.currentState}, AI Circuit: ${aiCircuitBreaker.currentState}`,
    };
  },
};

export const systemTools = [workerStatusTool];
