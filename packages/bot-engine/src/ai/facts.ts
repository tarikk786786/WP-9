/** Public details copied from https://tarikislam.in. Do not invent beyond this. */
export const TARIK_SITE = "https://tarikislam.in";

export const TARIK_PUBLIC = {
  name: "Tarik Islam",
  site: TARIK_SITE,
  studio: "Dezo",
  studioUrl: "https://dezo.in",
  title: "Forensic scientist, cybersecurity engineer, AI systems builder. Founder & CEO, Dezo.in",
  city: "Bhubaneswar",
  country: "India",
  base: "Bhubaneswar, India",
  timezone: "IST (UTC+05:30)",
  email: "princetarikislam@gmail.com",
  phone: "+91 89844 73230",
  instagram: "@tarik_islam_786",
  github: "@tarikk786786",
  accepting: "Q3 2026 high-stakes engagements",
  responseTime: "under 24 hours",
  degrees: [
    "B.Sc Forensic Science",
    "M.Sc Forensic Science",
    "MCA",
    "M.Tech Cybersecurity & AI",
  ],
  certs: ["CEH", "CHFI", "OSCP"],
  services: [
    "Forensic science and digital forensics",
    "Cybersecurity and zero-trust engineering",
    "AI systems and agents",
    "Full-stack product engineering",
    "Dezo.in AI product studio",
  ],
  pgpHint: "PGP fingerprint is on tarikislam.in",
} as const;

/** Things Tarik would actually say about himself. Not a sales script. */
export const TARIK_PUBLIC_FACTS: Record<string, string> = {
  identity: "tarik hoon",
  services: "forensics, cybersecurity, ai systems, products — jo public hai tarikislam.in pe hai",
  website: "tarikislam.in pe public cheez hai",
  portfolio: "portfolio tarikislam.in pe hai, studio dezo.in pe",
  studio: "dezo mera studio hai, dezo.in — ai-native, secure-by-design products",
  pricing: "rate andaz se nahi bolta",
  availability: "q3 2026 high-stakes site pe open hain. yahin bata kya soch rahe ho",
  process: "pehle sunta hoon, phir jo clear ho wohi kehta hoon",
  timeline: "date andaz se nahi ghadta",
  meeting: "time bhej, dekh ke confirm karta hoon",
  hours: "ist. aksar din mein yahin, avg 24 ghante ke andar",
  location: "bhubaneswar, india se kaam karta hoon",
  contact: `email ${TARIK_PUBLIC.email}. number ${TARIK_PUBLIC.phone}`,
  email: `${TARIK_PUBLIC.email} pe likh sakte ho`,
  credentials: "b.sc/m.sc forensic, mca, m.tech cyber+ai. ceh, chfi, oscp — detail tarikislam.in pe hai",
  forensics: "forensics/digital evidence pe kaam karta hoon",
  security: "cybersecurity engineering karta hoon",
  "ai-work": "ai systems pe kaam karta hoon",
  project: "haan, bata kya soch rahe ho",
};

export function factsForIntents(intents: string[], extra: string[] = []): string[] {
  const fromMap = intents
    .map((intent) => TARIK_PUBLIC_FACTS[intent])
    .filter((line): line is string => Boolean(line));
  return [...new Set([...fromMap, ...extra.map((line) => line.trim()).filter(Boolean)])];
}

export function tarikSiteBrief(): string {
  return [
    `Only these public facts from ${TARIK_PUBLIC.site} — do not invent more.`,
    `Name: ${TARIK_PUBLIC.name}. ${TARIK_PUBLIC.title}.`,
    `Studio: ${TARIK_PUBLIC.studio} (${TARIK_PUBLIC.studioUrl}).`,
    `Base: ${TARIK_PUBLIC.base}. Timezone: ${TARIK_PUBLIC.timezone}.`,
    `Email: ${TARIK_PUBLIC.email}. WhatsApp listed: ${TARIK_PUBLIC.phone}.`,
    `Instagram: ${TARIK_PUBLIC.instagram}. GitHub: ${TARIK_PUBLIC.github}.`,
    `Accepting: ${TARIK_PUBLIC.accepting}. Typical response: ${TARIK_PUBLIC.responseTime}.`,
    `Degrees: ${TARIK_PUBLIC.degrees.join("; ")}. Certs: ${TARIK_PUBLIC.certs.join(", ")}.`,
    `Work: ${TARIK_PUBLIC.services.join("; ")}.`,
    "Do not dump email, phone, city, degrees, or Q3 unless they asked.",
  ].join("\n");
}
