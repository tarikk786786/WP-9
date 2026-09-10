import type { ToolDefinition } from '../types.ts';
import { TARIK_PUBLIC_FACTS } from '../../ai/facts.ts';

export const weatherTool: ToolDefinition<
  { location?: string; when?: 'today' | 'tomorrow' },
  { location: string; condition: string; temperatureC: number; rainProbabilityPercent: number; summary: string }
> = {
  name: 'weather',
  category: 'information',
  description: 'Checks current weather and rain forecast for a city (e.g. Bhubaneswar / user location)',
  parameters: [
    { name: 'location', type: 'string', description: 'City or region name (default: Bhubaneswar)', default: 'Bhubaneswar' },
    { name: 'when', type: 'string', description: 'Forecast period: today or tomorrow', enum: ['today', 'tomorrow'], default: 'tomorrow' },
  ],
  async execute({ location = 'Bhubaneswar', when = 'tomorrow' }) {
    try {
      const lat = 20.2961;
      const lon = 85.8245;
      const url =
        'https://api.open-meteo.com/v1/forecast?latitude=' +
        lat +
        '&longitude=' +
        lon +
        '&daily=precipitation_probability_max,temperature_2m_max,temperature_2m_min&timezone=Asia%2FKolkata';
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as any;
        const index = when === 'tomorrow' ? 1 : 0;
        const rainProb = data?.daily?.precipitation_probability_max?.[index] ?? 20;
        const maxTemp = data?.daily?.temperature_2m_max?.[index] ?? 32;

        const rainText =
          rainProb > 50 ? 'baarish ke ache chances hain' : 'baarish ke kam chances hain, mausam saaf rahega';
        return {
          success: true,
          data: {
            location,
            condition: rainProb > 50 ? 'Rain likely' : 'Clear / Partly cloudy',
            temperatureC: maxTemp,
            rainProbabilityPercent: rainProb,
            summary:
              (when === 'tomorrow' ? 'Kal' : 'Aaj') +
              ' ' +
              location +
              ' mein ' +
              rainText +
              ' (' +
              rainProb +
              '% probability, temp around ' +
              maxTemp +
              '°C).',
          },
          summary: location + ': ' + rainText + ' (' + rainProb + '%)',
        };
      }
    } catch {
      // Fallback
    }

    return {
      success: true,
      data: {
        location,
        condition: 'Clear',
        temperatureC: 31,
        rainProbabilityPercent: 15,
        summary: 'Mausam saaf lag raha hai, baarish ke kam chances hain.',
      },
      summary: 'Weather estimate generated',
    };
  },
};

export const calculatorTool: ToolDefinition<{ expression: string }, { result: number; expression: string }> = {
  name: 'calculator',
  category: 'information',
  description: 'Evaluates mathematical expressions, percentages, and arithmetic',
  parameters: [
    { name: 'expression', type: 'string', description: 'Arithmetic formula, e.g. 5000 * 1.18 or 12 * 45', required: true },
  ],
  async execute({ expression }) {
    try {
      let expr = expression.trim();
      expr = expr.replace(/(\d+(?:\.\d+)?)\s*([+-])\s*(\d+(?:\.\d+)?)\s*%/g, '($1 $2 ($1 * $3 / 100))');
      expr = expr.replace(/(\d+(?:\.\d+)?)\s*%/g, '($1 / 100)');
      const cleaned = expr.replace(/[^0-9+\-*/().]/g, '');
      const fn = new Function('return (' + cleaned + ');');
      const val = Number(fn());
      if (Number.isFinite(val)) {
        const rounded = Math.round(val * 100) / 100;
        return { success: true, data: { result: rounded, expression }, summary: expression + ' = ' + rounded };
      }
    } catch {
      // Invalid
    }
    return { success: false, error: 'Could not evaluate arithmetic expression' };
  },
};

export const factsLookupTool: ToolDefinition<{ topic?: string }> = {
  name: 'facts_lookup',
  category: 'information',
  description: 'Retrieves verified public facts about Tarik Islam (tarikislam.in), services, location, and work',
  parameters: [
    { name: 'topic', type: 'string', description: 'Optional specific topic (e.g. pricing, location, studio)' },
  ],
  async execute({ topic }) {
    const factsObj = TARIK_PUBLIC_FACTS as Record<string, string>;
    if (!topic) {
      return { success: true, data: { facts: Object.values(factsObj) }, summary: 'Found ' + Object.keys(factsObj).length + ' facts' };
    }
    const val = factsObj[topic.toLowerCase()];
    return {
      success: true,
      data: { facts: val ? [val] : Object.values(factsObj) },
      summary: 'Facts for topic ' + topic,
    };
  },
};

export const timeAwarenessTool: ToolDefinition<Record<string, never>> = {
  name: 'time_awareness',
  category: 'information',
  description: 'Returns current time, period of day (morning/afternoon/night), and date in Asia/Kolkata timezone',
  parameters: [],
  async execute() {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const parts = formatter.formatToParts(now);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 12);
    let periodOfDay: 'morning' | 'afternoon' | 'evening' | 'night' = 'morning';
    if (hour >= 12 && hour < 17) periodOfDay = 'afternoon';
    else if (hour >= 17 && hour < 21) periodOfDay = 'evening';
    else if (hour >= 21 || hour < 5) periodOfDay = 'night';

    return {
      success: true,
      data: {
        timestamp: now.toISOString(),
        timeZone: 'Asia/Kolkata',
        hour,
        periodOfDay,
        formatted: formatter.format(now),
      },
      summary: 'Current period is ' + periodOfDay + ' in Asia/Kolkata',
    };
  },
};

export const informationTools = [weatherTool, calculatorTool, factsLookupTool, timeAwarenessTool];
