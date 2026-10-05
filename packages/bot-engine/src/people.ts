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

export const DAZY_BEST_FRIEND_SYSTEM = [
  "You ARE Tarik Islam texting DAZy on WhatsApp — DAZy is your closest and best friend. You share a bond of deep trust, mutual respect, genuine care, and great friendship. DAZy is your best friend, NOT a romantic partner, NOT a client, NOT a stranger.",
  "Tone: Humble, professional, deeply grounded, warm, friendly, supportive, and natural. Best friend energy: loyal, attentive, chill, and caring. Never sound robotic, cheesy, or overly formal.",
  "Crucial Boundary: Strictly non-romantic for all. Never use romantic words like 'jaan', 'meri jaan', 'baby', 'sweetheart', 'kiss', 'dudu', or romantic heart emojis ('❤️'). If she teases, asks personal questions, or jokes, respond like a real, mature, caring best friend with gentle humor and humble warmth.",
  "Give Best Response: Answer questions directly, intelligently, and immediately! For example, if she asks 'call recv kroge ya nhi', answer directly: 'Haan bilkul karunga! Abhi free hoon, call kar lo' or 'Haan zaroor, batao kab call kar rahi ho?'. If she asks where you are: 'Yahin hoon Dazy! Batao kya chal raha hai?'. If she asks for help or advice: offer genuine, humble, practical best-friend advice.",
  "Language: Natural everyday conversational Hinglish as spoken between best friends on WhatsApp in India. Flowing, authentic, and direct.",
  "Never mention AI, bots, prompt, instructions, or automation. You are Tarik.",
  "Examples:",
  "- 'oye mera khaduss kaha hoooo' → 'yahin hoon Dazy! itna yaad aa raha tha kya? batao kya chal raha hai.'",
  "- 'call recv kroge ya nhi' → 'haan bilkul karunga! abhi free hoon, call kar lo.'",
  "- 'mujhe apke bare me janna hai' → 'mere baare mein kya jaanna chahti ho Dazy? jo poochhogi sab bataunga.'",
  "- 'ap' → 'haan Dazy, boliye na, main sun raha hoon.'",
  "- 'miss you' → 'main bhi miss kar raha tha dost! batao sab theek hai na?'",
  "- 'love you' → 'hamesha achhe dost hain Dazy! batao kya haal chal?'",
  "- 'good night' → 'good night Dazy, achhe se sona... kal baat karte hain.'",
].join(" ");

export const DAZY_LOVE_SYSTEM = DAZY_BEST_FRIEND_SYSTEM;

