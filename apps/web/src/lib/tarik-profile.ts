import { TARIK_PUBLIC, TARIK_SITE } from "@bot/engine";

export type TarikProfile = {
  name: string;
  site: string;
  studio: string;
  studioUrl: string;
  title: string;
  base: string;
  email: string;
  phone: string;
  instagram: string;
  github: string;
  responseTime: string;
  accepting: string;
  services: string[];
  notes: string[];
  source: string;
  refreshedAt: string;
};

const CANONICAL: Omit<TarikProfile, "refreshedAt" | "source"> = {
  name: TARIK_PUBLIC.name,
  site: TARIK_PUBLIC.site,
  studio: TARIK_PUBLIC.studio,
  studioUrl: TARIK_PUBLIC.studioUrl,
  title: TARIK_PUBLIC.title,
  base: TARIK_PUBLIC.base,
  email: TARIK_PUBLIC.email,
  phone: TARIK_PUBLIC.phone,
  instagram: TARIK_PUBLIC.instagram,
  github: TARIK_PUBLIC.github,
  responseTime: TARIK_PUBLIC.responseTime,
  accepting: TARIK_PUBLIC.accepting,
  services: [...TARIK_PUBLIC.services],
  notes: [
    `Public site: ${TARIK_PUBLIC.site.replace("https://", "")} — details always start there.`,
    `${TARIK_PUBLIC.studioUrl.replace("https://", "")} is the AI product studio (founder & CEO).`,
    `Based in ${TARIK_PUBLIC.base}. Timezone ${TARIK_PUBLIC.timezone}.`,
    `Email ${TARIK_PUBLIC.email}. WhatsApp listed ${TARIK_PUBLIC.phone}.`,
    `Instagram ${TARIK_PUBLIC.instagram}. GitHub ${TARIK_PUBLIC.github}.`,
    `Degrees: ${TARIK_PUBLIC.degrees.join("; ")}. Certs: ${TARIK_PUBLIC.certs.join(", ")}.`,
    `Site lists ${TARIK_PUBLIC.accepting}. Typical response ${TARIK_PUBLIC.responseTime}.`,
    "Do not invent prices, fake case results, or unpublished credentials.",
  ],
};

let cached: TarikProfile = {
  ...CANONICAL,
  source: TARIK_SITE,
  refreshedAt: new Date().toISOString(),
};

let lastFetchMs = 0;
let inFlight: Promise<TarikProfile> | null = null;
const PROFILE_TTL_MS = 10 * 60 * 1000;

export function getTarikProfile(): TarikProfile {
  return cached;
}

/** Refresh in the background. Never blocks a WhatsApp reply. */
export function scheduleProfileRefresh() {
  if (Date.now() - lastFetchMs < PROFILE_TTL_MS) return;
  void refreshTarikProfile();
}

export function profileBrief(profile = cached) {
  return [
    `Owner: ${profile.name}.`,
    `Role: ${profile.title}.`,
    `Base: ${profile.base}.`,
    `Site: ${profile.site}.`,
    `Studio: ${profile.studio} (${profile.studioUrl}).`,
    `Email: ${profile.email}. Phone: ${profile.phone}.`,
    `Instagram: ${profile.instagram}. GitHub: ${profile.github}.`,
    `Services: ${profile.services.join("; ")}.`,
    `Availability: currently accepting ${profile.accepting}.`,
    `Typical response: ${profile.responseTime}.`,
    ...profile.notes,
  ].join("\n");
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function refreshTarikProfile(): Promise<TarikProfile> {
  if (inFlight) return inFlight;
  if (Date.now() - lastFetchMs < PROFILE_TTL_MS && cached.notes.length > 0) {
    return cached;
  }
  inFlight = pullSiteProfile().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function pullSiteProfile(): Promise<TarikProfile> {
  lastFetchMs = Date.now();
  try {
    const response = await fetch(TARIK_SITE, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
      headers: {
        Accept: "text/html",
        "User-Agent": "Mozilla/5.0 (compatible; TarikDesk/1.0; +https://tarikislam.in)",
      },
    });
    if (!response.ok) throw new Error(String(response.status));
    const html = await response.text();
    const text = stripHtml(html);
    const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? CANONICAL.email;
    const phone = text.match(/\+91\s*89844\s*73230/)?.[0]?.replace(/\s+/g, " ") ?? CANONICAL.phone;
    const instagram = text.match(/@tarik_islam_786/i)?.[0] ?? CANONICAL.instagram;
    const github = text.match(/@tarikk786786/i)?.[0] ?? CANONICAL.github;
    const city = /bhubaneswar/i.test(text) ? "Bhubaneswar, India" : CANONICAL.base;
    const accepting = /q3 2026/i.test(text) ? "Q3 2026 high-stakes engagements" : CANONICAL.accepting;
    const responseTime = /24 hours/i.test(text) ? "under 24 hours" : CANONICAL.responseTime;
    cached = {
      ...CANONICAL,
      email,
      phone,
      instagram,
      github,
      base: city,
      accepting,
      responseTime,
      notes: [
        ...CANONICAL.notes,
        /q3 2026/i.test(text)
          ? "Live site still lists Q3 2026 high-stakes engagements as open."
          : "If availability is unclear, point them to tarikislam.in.",
      ],
      source: TARIK_SITE,
      refreshedAt: new Date().toISOString(),
    };
  } catch {
    cached = {
      ...CANONICAL,
      source: TARIK_SITE,
      refreshedAt: cached.refreshedAt,
    };
  }
  return cached;
}
