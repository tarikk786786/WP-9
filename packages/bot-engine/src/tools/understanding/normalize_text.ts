import type { ToolDefinition } from "../types.ts";

const HINGLISH_DICTIONARY: Record<string, string> = {
  kl: "kal",
  aj: "aaj",
  mlt: "milte",
  mlna: "milna",
  yr: "yaar",
  bhaii: "bhai",
  bhaiii: "bhai",
  broo: "bro",
  kyaaa: "kya",
  h: "hai",
  ni: "nahi",
  nhi: "nahi",
  nh: "nahi",
  kb: "kab",
  kidhr: "kidhar",
  kdr: "kidhar",
  btao: "batao",
  bta: "bata",
  kr: "kar",
  rha: "raha",
  rhi: "rahi",
  rhe: "rahe",
  kro: "karo",
  kra: "kara",
  pls: "please",
  plz: "please",
  thx: "thanks",
  ty: "thanks",
  tysm: "thanks a lot",
  sahi: "sahi",
  badhiyaa: "badhiya",
  acchaa: "achha",
  acha: "achha",
  smjh: "samajh",
  hogaa: "hoga",
  hgi: "hogi",
  barish: "baarish",
  mausam: "mausam",
  kaam: "kaam",
  batana: "batana",
  freee: "free",
  busy: "busy",
  bje: "baje",
  subah: "subah",
  sham: "shaam",
  raat: "raat",
};

export function normalizeHinglishText(raw: string): { normalized: string; changes: string[] } {
  const changes: string[] = [];

  // 1. Condense prolonged repeated letters (e.g. "kyaaaa" -> "kya", "bhaiiii" -> "bhai", "yrrrr" -> "yaar")
  let text = raw.replace(/([a-zA-Z])\1{2,}/g, (match, char) => {
    changes.push(`Condensed: ${match} -> ${char}${char}`);
    return `${char}${char}`;
  });

  // 2. Tokenize and map against dictionary
  const tokens = text.split(/\b/);
  const transformed = tokens.map((token) => {
    const lower = token.toLowerCase();
    if (HINGLISH_DICTIONARY[lower]) {
      const replacement = HINGLISH_DICTIONARY[lower];
      changes.push(`Replaced: ${token} -> ${replacement}`);
      return replacement;
    }
    return token;
  });

  text = transformed.join("");

  // 3. Clean up common split phrases
  text = text
    .replace(/\bkya\s+kr\s+rha\b/gi, "kya kar raha")
    .replace(/\bkl\s+mlt\s+h\b/gi, "kal milte hain")
    .replace(/\bkl\s+milna\s+hai\b/gi, "kal milte hain")
    .replace(/\s{2,}/g, " ")
    .trim();

  return { normalized: text, changes };
}

export const normalizeTextTool: ToolDefinition<{ text: string }, { normalized: string; changes: string[] }> = {
  name: "normalize_text",
  category: "understanding",
  description: "Repairs Hinglish/English shorthand, slang, and repeated characters into clean natural text",
  parameters: [
    {
      name: "text",
      type: "string",
      description: "Raw incoming message text",
      required: true,
    },
  ],
  async execute({ text }) {
    const res = normalizeHinglishText(text);
    return {
      success: true,
      data: res,
      summary: `Normalized text from "${text}" to "${res.normalized}"`,
    };
  },
};
