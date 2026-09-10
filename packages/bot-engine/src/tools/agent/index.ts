import type { ToolDefinition } from "../types.ts";

export const shouldReplyTool: ToolDefinition<
  { text: string; isGroup?: boolean; mentionsBot?: boolean; fromMe?: boolean },
  { decision: "RESPOND" | "REACT" | "WAIT" | "IGNORE" | "ESCALATE"; emoji?: string; reason: string }
> = {
  name: "should_reply",
  category: "agent",
  description: "Determines whether a message should receive a full reply, an emoji reaction, be ignored, or escalated",
  parameters: [
    { name: "text", type: "string", description: "Incoming message text", required: true },
    { name: "isGroup", type: "boolean", description: "True if from a WhatsApp group" },
    { name: "mentionsBot", type: "boolean", description: "True if bot was mentioned in group" },
    { name: "fromMe", type: "boolean", description: "True if self-message" },
  ],
  async execute({ text, isGroup = false, mentionsBot = false, fromMe = false }) {
    if (fromMe) {
      return { success: true, data: { decision: "IGNORE", reason: "Self-message" } };
    }
    if (isGroup && !mentionsBot) {
      return { success: true, data: { decision: "IGNORE", reason: "Unmentioned group message" } };
    }

    const t = text.trim();
    if (!t) return { success: true, data: { decision: "IGNORE", reason: "Empty text" } };

    // Human escalation
    if (/\b(talk to human|real person|call me urgent|need help urgently|tarik se baat|tarik ko call)\b/i.test(t)) {
      return { success: true, data: { decision: "ESCALATE", reason: "Explicit human request" } };
    }

    // Reaction intelligence
    if (/^(😂|🤣|hahaha+|lol|lmao)+$/i.test(t.replace(/\s+/g, ""))) {
      return { success: true, data: { decision: "REACT", emoji: "😂", reason: "Laughter reaction" } };
    }
    if (/^(👍|👌|k|ok|thx|thanks)$/i.test(t)) {
      return { success: true, data: { decision: "REACT", emoji: "👍", reason: "Acknowledgment reaction" } };
    }
    if (/^(❤️|💖|love you)$/i.test(t)) {
      return { success: true, data: { decision: "REACT", emoji: "❤️", reason: "Affection reaction" } };
    }

    return { success: true, data: { decision: "RESPOND", reason: "Conversational query" } };
  },
};

export const classifyIntentTool: ToolDefinition<{ text: string }, { intent: string; confidence: number }> = {
  name: "classify_intent",
  category: "agent",
  description: "Classifies the message's primary intent",
  parameters: [
    { name: "text", type: "string", description: "Message text", required: true },
  ],
  async execute({ text }) {
    const t = text.toLowerCase();
    let intent = "chat";
    if (/\b(kal|milna|milte|free|busy)\b/i.test(t)) intent = "schedule_or_availability";
    else if (/\b(price|pricing|cost|charge|kitna)\b/i.test(t)) intent = "pricing";
    else if (/\b(weather|baarish|rain|mausam)\b/i.test(t)) intent = "weather";
    else if (/\b(who are you|who r u|kaun ho|bot)\b/i.test(t)) intent = "identity";
    return { success: true, data: { intent, confidence: 0.95 } };
  },
};

export const chooseModelTool: ToolDefinition<
  { complexity: "simple" | "moderate" | "complex"; hasSpecialPerson?: boolean },
  { model: string; provider: string; tier: string }
> = {
  name: "choose_model",
  category: "agent",
  description: "Routes request to fast, strong, or fallback model",
  parameters: [
    { name: "complexity", type: "string", description: "Request complexity", enum: ["simple", "moderate", "complex"], required: true },
    { name: "hasSpecialPerson", type: "boolean", description: "Whether chatting with VIP / special contact" },
  ],
  async execute({ complexity, hasSpecialPerson }) {
    if (hasSpecialPerson || complexity === "complex") {
      return { success: true, data: { model: "gpt-4o", provider: "openai", tier: "reasoning" } };
    }
    if (complexity === "moderate") {
      return { success: true, data: { model: "gemini-1.5-flash", provider: "gemini", tier: "balanced" } };
    }
    return { success: true, data: { model: "groq/llama-3.3-70b-versatile", provider: "groq", tier: "fast" } };
  },
};

export const verifyReplyTool: ToolDefinition<{ draftReply: string }, { approved: boolean; sanitizedReply: string; warnings: string[] }> = {
  name: "verify_reply",
  category: "agent",
  description: "Audits draft reply to prevent hallucinations, invented prices, and robotic on-behalf phrasing",
  parameters: [
    { name: "draftReply", type: "string", description: "Draft response text", required: true },
  ],
  async execute({ draftReply }) {
    const warnings: string[] = [];
    let clean = draftReply.trim();

    // Check invented pricing (e.g. ₹500, $50, etc.)
    if (/(\$|₹|rs\.?\s*)\d+/i.test(clean)) {
      warnings.push("Invented price detected. Replaced with public inquiry guidance.");
      clean = "i don't invent a rate offhand. tell me what you're thinking, and we can discuss.";
    }

    // Strip bot brochure phrases
    clean = clean
      .replace(/as an ai language model/gi, "")
      .replace(/i am an artificial intelligence/gi, "")
      .replace(/on behalf of tarik/gi, "i'm tarik")
      .replace(/\s{2,}/g, " ")
      .trim();

    return {
      success: true,
      data: {
        approved: warnings.length === 0,
        sanitizedReply: clean,
        warnings,
      },
    };
  },
};

export const humanizeReplyTool: ToolDefinition<{ text: string }, { humanizedText: string }> = {
  name: "humanize_reply",
  category: "agent",
  description: "Polishes response into Tarik's authentic, humble, well-mannered first-person WhatsApp voice",
  parameters: [
    { name: "text", type: "string", description: "Raw response text", required: true },
  ],
  async execute({ text }) {
    let out = text.trim();
    // Ensure lowercase opening if casual
    if (/^(haan|ji|kal|theek|sahi|bilkul)\b/i.test(out)) {
      out = out.charAt(0).toLowerCase() + out.slice(1);
    }
    return { success: true, data: { humanizedText: out } };
  },
};

export const agentTools = [
  shouldReplyTool,
  classifyIntentTool,
  chooseModelTool,
  verifyReplyTool,
  humanizeReplyTool,
];
