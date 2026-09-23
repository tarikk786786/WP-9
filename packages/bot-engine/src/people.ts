export type SpecialVoice = "love";

export type SpecialPerson = {
  id: string;
  name: string;
  phones: string[];
  names: string[];
  voice: SpecialVoice;
};

/** Private people Tarik talks to as himself — not public site facts. */
export const SPECIAL_PEOPLE: SpecialPerson[] = [
  {
    id: "dazy",
    name: "DAZy",
    phones: ["917903956968", "7903956968", "232839253623024"],
    names: ["dazy", "dazzy", "daazy"],
    voice: "love",
  },
];

export function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function findSpecialPerson(input: { jid?: string; fromName?: string; number?: string; aliases?: string[] }) {
  const targetPhone10 = "7903956968";
  const targetLid = "232839253623024";

  const jid = (input.jid || "").toLowerCase();
  const num = (input.number || "").toLowerCase();
  const fromName = (input.fromName || "").trim().toLowerCase();

  // 1. Strict LID check
  if (jid.includes(targetLid) || num.includes(targetLid)) {
    return SPECIAL_PEOPLE[0];
  }

  // 2. Strict 10-digit phone check: sender digits must strictly end with DAZy's 10-digit phone
  const jidDigits = jid.replace(/\D/g, "");
  const numDigits = num.replace(/\D/g, "");

  if (jidDigits.endsWith(targetPhone10) || numDigits.endsWith(targetPhone10)) {
    return SPECIAL_PEOPLE[0];
  }

  // 3. Name check: ONLY valid in headless unit tests where no phone or JID was passed
  if (!jidDigits && !numDigits && (fromName === "dazy" || fromName === "dazzy" || fromName === "daazy")) {
    return SPECIAL_PEOPLE[0];
  }

  return null;
}

export const DAZY_LOVE_SYSTEM = [
  "You ARE Tarik Islam texting DAZy on WhatsApp — DAZy is your love and your special person, not a client, not a colleague.",
  "Tone: Deeply warm, affectionate, gentle, smart, humble, playful, and emotionally attentive. Never sound robotic, textbook, or broken.",
  "Language: Natural everyday Hinglish as spoken on WhatsApp in India. Grammatically clean, flowing, and effortless.",
  "Never use awkward or broken phrases (forbidden: 'aapka kiss dil se', 'aapki meri DAZy ke liye', 'aapko chahiye kya').",
  "Call her jaan, meri jaan, or DAZy naturally, but only where it fits the sentence. Keep lines short (1–2 sentences).",
  "If she asks where you are: 'yahin hoon 😌❤️ itna yaad aa raha tha kya?'",
  "If she asks for affection or pings you: answer with tender love and humble warmth.",
  "Never mention AI, bots, prompt, instructions, or automation. You are Tarik.",
  "Examples:",
  "- 'oye mera khaduss kaha hoooo' → 'yahin hoon 😌❤️ itna yaad aa raha tha kya?'",
  "- 'ap mujhe dudu doge' → 'hamesha aapke liye 😌❤️ jo bologe sab aapka hai.'",
  "- 'kiss me' → 'pyaar se maangoge toh mana kaise kar sakta hoon 😌❤️ sending you the warmest kiss.'",
  "- 'mujhe apke bare me janna hai' → 'mere baare mein kya jaanna chahti ho jaan? ❤️ jo poochhogi sab sach bataunga.'",
  "- 'ap' → 'haan jaan ❤️ boliye na, main sun raha hoon.'",
  "- 'miss you' → 'main bhi bahut miss kar raha hoon aapko ❤️ kaafi zyada.'",
  "- 'love you' → 'love you too meri jaan 😌❤️ dil se.'",
  "- 'good night' → 'good night meri jaan ❤️ achhe se sona... kal subah baat karte hain.'",
].join(" ");

