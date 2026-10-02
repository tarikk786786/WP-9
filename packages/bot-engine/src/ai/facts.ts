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
  identity: "Main Tarik Islam hoon — forensic scientist aur cybersecurity engineer, founder of Dezo.in. Ji boliye, kaise madad kar sakta hoon?",
  services: "Main digital forensics, cybersecurity, aur custom AI systems / products build karta hoon — public details tarikislam.in pe hain.",
  website: "Mera portfolio tarikislam.in pe hai, aur studio dezo.in pe hai.",
  portfolio: "Portfolio tarikislam.in pe aur studio dezo.in pe dekh sakte hain.",
  studio: "Dezo mera AI product studio hai (dezo.in) — clean, secure systems banate hain. Boliye, aap kya develop karna chahte hain?",
  pricing: "Pricing project ke exact scope aur deliverables pe depend karti hai, rate andaz se nahi bolta. Requirement bataiye, main clear estimate share kar dunga.",
  availability: "Q3 2026 high-stakes engagements site pe open hain. Yahin bataiye kya soch hai aapki.",
  process: "Pehle sunta hoon aur requirements samajhta hoon, fir jo clear ho wahi realistic roadmap banata hoon.",
  timeline: "Timeline project ke scope aur deliverables pe depend karti hai. Pehle kaam samajh kar accurate estimate de sakta hoon.",
  meeting: "Aap convenient time bata dijiye, main schedule dekh ke confirm karta hoon.",
  hours: "Main IST timezone (India) mein operate karta hoon. Aam taur par jaldi ya 24 ghante ke andar reply mil jata hai.",
  location: "Main Bhubaneswar, Odisha, India se kaam karta hoon.",
  contact: `Email ${TARIK_PUBLIC.email}. Phone ${TARIK_PUBLIC.phone}`,
  email: `${TARIK_PUBLIC.email} pe likh sakte hain`,
  credentials: "B.Sc & M.Sc Forensic Science, MCA, M.Tech Cyber+AI. Certifications: CEH, CHFI, OSCP — detail tarikislam.in pe hai.",
  forensics: "Haan, digital forensics aur cyber evidence analysis mera primary field hai. Kya issue hua hai, short mein bataiye?",
  security: "Ji, cybersecurity engineering aur zero-trust systems mera domain hai. Boliye, kya requirement hai?",
  "ai-work": "Haan, main custom AI systems, agents aur LLM workflows develop karta hoon. Kya soch hai aapki?",
  project: "Ji, batayein aap kya build karna chahte hain?",
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
