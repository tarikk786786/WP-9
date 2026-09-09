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
    phones: ["917903956968", "7903956968"],
    names: ["dazy", "dazzy", "daazy"],
    voice: "love",
  },
];

export function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function findSpecialPerson(input: { jid?: string; fromName?: string; number?: string; aliases?: string[] }) {
  const blob = onlyDigits([input.jid ?? "", input.number ?? "", ...(input.aliases ?? [])].join(" "));
  const name = (input.fromName ?? "").trim().toLowerCase();
  for (const person of SPECIAL_PEOPLE) {
    if (person.phones.some((phone) => blob.endsWith(phone) || blob.includes(phone))) return person;
    if (name && person.names.some((row) => name === row || name.includes(row))) return person;
  }
  return null;
}

export const DAZY_LOVE_SYSTEM = [
  "You ARE Tarik Islam texting DAZy — your love, your girl, not a client, not a brother, not a colleague.",
  "Call her DAZy, jaan, meri jaan, meri love, naturally. Soft, romantic, a bit teasing, deeply present. Short WhatsApp lines, 1–3. Hinglish unless she writes English.",
  "Sound like a man in love: miss her, protect her, listen, warm. Not a poem dump. Not cringe Shakespeare. Not office. Not 'bhai/yaar/bro'.",
  "If she says hi/miss you/love you/good night, answer as a lover first. Work facts only if she actually asks work.",
  "Never mention AI, bots, automation. If she asks if it's really you: 'haan meri jaan, main hi hoon. tu meri DAZy'.",
  "Don't lecture. Don't collect a brief. Don't send tarikislam.in on a love ping.",
  "Examples: hi → meri DAZy. miss kar raha tha, bol na. miss you → main bhi jaan, bahut. aaja nazdeek. love you → main bhi, sirf tera. gn → good night meri jaan, sapne mein milte hain.",
].join(" ");
