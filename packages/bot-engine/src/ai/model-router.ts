import { telemetry } from '@bot/shared';

export type ModelTier = 'fast' | 'general' | 'reasoning' | 'fallback';

export interface ModelRouteDecision {
  tier: ModelTier;
  model: string;
  provider: 'groq' | 'gemini' | 'openai' | 'anthropic' | 'local';
  reason: string;
}

export function routeModel(input: {
  text: string;
  historyLength?: number;
  hasTools?: boolean;
  isMultilingual?: boolean;
  requiresReasoning?: boolean;
}): ModelRouteDecision {
  const span = telemetry.startSpan('ai.model_routing');
  const text = input.text.toLowerCase();
  const wordCount = text.split(/\s+/).length;

  // 1. Check for quick conversational pleasantries (Super Fast / Cheap)
  const isGreeting = /^(hi|hey|hello|namaste|hlo|helo|sup|yo|haan|ok|theek hai|sahi hai|thanks|dhanyawad)$/i.test(text.trim());
  if (isGreeting && wordCount <= 3) {
    span.end({ tier: 'fast', provider: 'groq' });
    return {
      tier: 'fast',
      model: 'llama-3.3-70b-versatile',
      provider: 'groq',
      reason: 'Short conversational greeting/ack routed to fast Groq inference',
    };
  }

  // 2. High reasoning requirements (Multi-step tool use, complex proposal, calculations)
  if (input.requiresReasoning || input.hasTools || wordCount > 80 || /compare|calculate|contract|proposal|detailed breakdown/i.test(text)) {
    const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
    span.end({ tier: 'reasoning', provider: hasOpenAI ? 'openai' : 'groq' });
    return {
      tier: 'reasoning',
      model: hasOpenAI ? 'gpt-4o' : 'llama-3.3-70b-versatile',
      provider: hasOpenAI ? 'openai' : 'groq',
      reason: 'Complex business query or tool invocation requires strong reasoning model',
    };
  }

  // 3. Multi-turn context or large conversation history (Gemini / Groq)
  if ((input.historyLength || 0) > 10) {
    const hasGemini = Boolean(process.env.GEMINI_API_KEY);
    span.end({ tier: 'general', provider: hasGemini ? 'gemini' : 'groq' });
    return {
      tier: 'general',
      model: hasGemini ? 'gemini-1.5-flash' : 'llama-3.3-70b-versatile',
      provider: hasGemini ? 'gemini' : 'groq',
      reason: 'Long multi-turn context handled by large-window model',
    };
  }

  // 4. Standard default
  span.end({ tier: 'fast', provider: 'groq' });
  return {
    tier: 'fast',
    model: 'llama-3.3-70b-versatile',
    provider: 'groq',
    reason: 'Standard Hinglish conversation turn with sub-second response requirement',
  };
}
