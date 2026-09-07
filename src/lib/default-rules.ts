import type { BotRules } from "@/lib/types";

export const defaultRules: BotRules = {
  enabled: true,
  botName: "Relay",
  defaultReply:
    "Message mil gaya, thank you. Main ise shaanti se dekh raha hoon — aap kuch aur likhna chaho to likh do, main jaldi wapas aaunga.",
  greetingReply: "Hey, kaise ho? Main yahin hoon. Aaram se bolo kya chal raha hai.",
  includeName: true,
  useLocalLlm: true,
  preferredModel: "",
  businessHoursEnabled: false,
  timezone: "UTC",
  openHour: 9,
  closeHour: 18,
  afterHoursReply:
    "Abhi thoda late ho gaya hai. Main 9 se 6 ke beech calmly reply karta hoon — message chhod do, main aake dekh lunga.",
  keywordRules: [
    {
      id: "hello",
      keyword: "hello",
      reply: "Hey, kaise ho? Main yahin hoon, bilkul calmly. Bolo kya haal hai.",
      enabled: true,
    },
    {
      id: "hi",
      keyword: "hi",
      reply: "Hi… aaram se. Main sun raha hoon. Kya chal raha hai?",
      enabled: true,
    },
    {
      id: "hours",
      keyword: "hours",
      reply: "Main usually 9 se 6 tak yahin hota hoon. Tension mat lo, note chhod do.",
      enabled: true,
    },
    {
      id: "price",
      keyword: "price",
      reply: "Price wali baat samajh gaya. Batao kya chahiye, main detail narmi se bhej dunga.",
      enabled: true,
    },
  ],
};
