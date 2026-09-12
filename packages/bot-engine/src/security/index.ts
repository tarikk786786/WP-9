export * from './prompt-injection.ts';
export * from './pii.ts';
export * from './secrets.ts';
export * from './input-guard.ts';
export * from './retrieval-guard.ts';
export * from './tool-guard.ts';
export * from './output-guard.ts';
export * from './policies.ts';

import { inputGuard } from './input-guard.ts';
import { outputGuard } from './output-guard.ts';
import { retrievalGuard } from './retrieval-guard.ts';
import { toolGuard } from './tool-guard.ts';
import { secretScanner } from './secrets.ts';
import { piiScanner } from './pii.ts';

export const SecurityGateway = {
  input: inputGuard,
  output: outputGuard,
  retrieval: retrievalGuard,
  tool: toolGuard,
  secrets: secretScanner,
  pii: piiScanner,
};
