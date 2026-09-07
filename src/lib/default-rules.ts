import type { BotRules } from "@/lib/types";

export const defaultRules: BotRules = {
  enabled: true,
  botName: "Tarik",
  defaultReply:
    "Message Tarik tak pahunch gaya. Extra detail ho to likh dena — public facts tarikislam.in pe hain, baaki main personally, calmly wapas aaunga.",
  greetingReply:
    "Hey, kaise ho? Tarik yahan hai — forensics, AI, security. Aaram se bolo kya chal raha hai.",
  includeName: true,
  useLocalLlm: true,
  preferredModel: "",
  businessHoursEnabled: false,
  timezone: "Asia/Kolkata",
  openHour: 9,
  closeHour: 21,
  afterHoursReply:
    "Tarik thoda late hours mein hai. Message chhod do — woh under 24 hours, narmi se wapas aata hai. Detail tarikislam.in pe hai.",
  keywordRules: [
    {
      id: "hello",
      keyword: "hello",
      reply: "Hey, kaise ho? Tarik yahan hai. Aaram se bolo.",
      enabled: true,
    },
    {
      id: "hi",
      keyword: "hi",
      reply: "Hi… Tarik yahin hai, calmly. Kya chal raha hai?",
      enabled: true,
    },
    {
      id: "hours",
      keyword: "hours",
      reply: "Tarik usually 9 se 9 tak India se available rehta hai. Note chhod do.",
      enabled: true,
    },
    {
      id: "price",
      keyword: "price",
      reply: "Price site pe fix nahi. Scope batao, Tarik personally number dega — andaz nahi.",
      enabled: true,
    },
  ],
};
