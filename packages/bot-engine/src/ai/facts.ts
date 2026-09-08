/** Public facts only. Never invent prices, dates, or unpublished credentials. */
export const TARIK_PUBLIC_FACTS: Record<string, string> = {
  identity: "tarik hoon",
  services: "forensics, security, ai, products — dezo studio ke through. jo confirm nahi, uspe andaz nahi",
  website: "jo public hai woh tarikislam.in pe hai",
  portfolio: "portfolio publicly sealed hai, isliye andaz se case nahi ghadta. specific ho to yahin puchh lena",
  studio: "dezo mera studio hai, dezo.in",
  pricing: "rate andaz se nahi bolta. scope clear ho tabhi exact number",
  availability: "time nikalne ki koshish karta hoon. site pe under 24h reply likha hai, guarantee nahi",
  process: "pehle short brief — kya, kis ke liye, kab tak. phir jo clear ho, wohi approach/time/rate",
  timeline: "timeline tabhi exact jab scope clear ho. pehle se date nahi ghadta",
  meeting: "call ho sakta hai. time bhejo, dekh ke confirm karta hoon — pehle se haan nahi",
  hours: "din mein aksar yahin hota hoon. note chhod dena, dekh ke likhta hoon",
  location: "india se kaam karta hoon. milna tab decide jab kaam clear ho",
  forensics: "forensics/digital evidence pe kaam karta hoon. detail ke bina claim nahi",
  security: "cybersecurity engineering karta hoon. scope ke bina result nahi bolta",
  "ai-work": "ai systems, rag, agents pe kaam karta hoon. oversell nahi",
  project: "theek. agar 3 lines mein kya / kis ke liye / kab tak bata sako, uske hisaab se exact bol paunga",
};

export function factsForIntents(intents: string[], extra: string[] = []): string[] {
  const fromMap = intents
    .map((intent) => TARIK_PUBLIC_FACTS[intent])
    .filter((line): line is string => Boolean(line));
  return [...new Set([...fromMap, ...extra.map((line) => line.trim()).filter(Boolean)])];
}
