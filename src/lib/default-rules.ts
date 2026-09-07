import type { BotRules } from "@/lib/types";

export const defaultRules: BotRules = {
  enabled: true,
  botName: "Relay",
  defaultReply:
    "Thanks for your message. I got it and will reply here as soon as I can.",
  greetingReply:
    "Hi — thanks for writing. This inbox is watched by my auto-reply. Tell me what you need and I will follow up.",
  includeName: true,
  businessHoursEnabled: false,
  timezone: "UTC",
  openHour: 9,
  closeHour: 18,
  afterHoursReply:
    "I am away from this chat right now. I will reply during business hours (9:00–18:00).",
  keywordRules: [
    {
      id: "hello",
      keyword: "hello",
      reply: "Hello! How can I help you today?",
      enabled: true,
    },
    {
      id: "hi",
      keyword: "hi",
      reply: "Hi there — what can I help with?",
      enabled: true,
    },
    {
      id: "hours",
      keyword: "hours",
      reply: "I usually reply between 9:00 and 18:00. Leave a note and I will get back to you.",
      enabled: true,
    },
    {
      id: "price",
      keyword: "price",
      reply: "Thanks for asking about pricing. Share what you need and I will send details shortly.",
      enabled: true,
    },
  ],
};
