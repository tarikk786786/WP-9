import type { BotRules } from "@/lib/types";

export const defaultRules: BotRules = {
  enabled: true,
  botName: "Tarik",
  defaultReply:
    "Message mil gaya, shukriya. Extra kuch ho to likh dena — jo public hai woh tarikislam.in pe hai, baaki main khud, shaanti se wapas aata hoon.",
  greetingReply:
    "Hey, kaise ho? Main Tarik hoon — forensics, AI, security. Aaram se bolo kya chal raha hai.",
  includeName: true,
  useLocalLlm: true,
  preferredModel: "",
  language: "hinglish",
  tone: "soft",
  emoji: false,
  signature: "",
  customFacts: "",
  replyMode: "all",
  replyToMedia: true,
  replyToGroups: false,
  showTyping: true,
  businessHoursEnabled: false,
  timezone: "Asia/Kolkata",
  openHour: 9,
  closeHour: 21,
  afterHoursReply:
    "Abhi thoda late ho gaya hai mere side. Message chhod do — main under 24 hours, narmi se wapas aata hoon. Detail tarikislam.in pe hai.",
  keywordRules: [
    {
      id: "hello",
      keyword: "hello",
      reply: "Hey, kaise ho? Main Tarik hoon. Aaram se bolo.",
      enabled: true,
    },
    {
      id: "hi",
      keyword: "hi",
      reply: "Hi… main yahin hoon, calmly. Kya chal raha hai?",
      enabled: true,
    },
    {
      id: "hours",
      keyword: "hours",
      reply: "Main usually 9 se 9 tak India se available rehta hoon. Note chhod do.",
      enabled: true,
    },
    {
      id: "price",
      keyword: "price",
      reply: "Price site pe fix nahi. Scope batao, main khud number dunga — andaz nahi lagaunga.",
      enabled: true,
    },
  ],
};
