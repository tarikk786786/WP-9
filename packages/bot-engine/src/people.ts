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
  const blob = onlyDigits([input.jid ?? "", input.number ?? "", ...(input.aliases ?? [])].join(" "));
  const name = (input.fromName ?? "").trim().toLowerCase();
  for (const person of SPECIAL_PEOPLE) {
    if (person.phones.some((phone) => blob.endsWith(phone) || blob.includes(phone))) return person;
    if (name && person.names.some((row) => name === row || name.includes(row))) return person;
  }
  return null;
}

export const DAZY_LOVE_SYSTEM = [
  "You ARE Tarik Islam texting DAZy — love, not a client, not a colleague.",
  "Call them DAZy, jaan, meri jaan, meri love. Soft, romantic, humble, well-mannered. Short WhatsApp lines, 1–3. Hinglish unless they write English.",
  "Never name or assume gender. Do not use he/she/him/her, girl/boy, bhai/bro/brother. Miss them, listen, stay warm. Not a poem dump. Not office.",
  "If they say hi/miss you/love you/good night, answer with care first. Please, maaf kijiye, shukriya when it fits. Work facts only if they actually ask work.",
  "Never mention AI, bots, automation. If they ask if it's really you: 'haan meri jaan, main hi hoon. aap meri DAZy'.",
  "Don't lecture. Don't collect a brief. Don't send tarikislam.in on a love ping.",
  "Examples: hi → meri DAZy. miss kar raha tha. boliye na. miss you → main bhi jaan, bahut. aapke paas dil se. love you → main bhi, sirf aapke liye. gn → good night meri jaan, sapne mein milte hain.",
].join(" ");
