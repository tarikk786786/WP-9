/** Public facts only. Never invent prices or unpublished credentials. */
export const TARIK_PUBLIC_FACTS: Record<string, string> = {
  identity: "main tarik hoon",
  services: "forensics, security, ai, products — dezo se studio work bhi",
  website: "public site tarikislam.in pe hai",
  portfolio: "portfolio publicly sealed hai, specific kaam ho to yahin puchh",
  studio: "dezo mera studio hai, dezo.in",
  pricing: "rate andaz se nahi bolta, scope clear ho to number deta hoon",
  availability: "kaam le sakta hoon, typically 24h ke andar reply",
  process: "pehle 4-5 lines mein kya banana hai, phir approach, phir time+rate",
  timeline: "timeline scope pe depend karti hai, andaz se date nahi deta",
  meeting: "call ho sakta hai, time bhej confirm karke aata hoon",
  hours: "din mein mostly yahin hota hoon, note chhod dena",
  location: "india se kaam karta hoon, meet tab jab kaam clear ho",
  forensics: "forensics/digital evidence mera kaam hai",
  security: "cybersecurity engineering karta hoon",
  "ai-work": "ai systems, rag, agents yeh sab karta hoon",
  project: "haan, banana hai to short brief likh de — kya, kab tak, kis ke liye",
};

export function factsForIntents(intents: string[], extra: string[] = []): string[] {
  const fromMap = intents
    .map((intent) => TARIK_PUBLIC_FACTS[intent])
    .filter((line): line is string => Boolean(line));
  return [...new Set([...fromMap, ...extra.map((line) => line.trim()).filter(Boolean)])];
}
