export type TarikProfile = {
  name: string;
  site: string;
  studio: string;
  studioUrl: string;
  title: string;
  base: string;
  responseTime: string;
  accepting: string;
  services: string[];
  notes: string[];
  source: string;
  refreshedAt: string;
};

export const TARIK_SITE = "https://tarikislam.in";

const CANONICAL: Omit<TarikProfile, "refreshedAt" | "source"> = {
  name: "Tarik Islam",
  site: TARIK_SITE,
  studio: "Dezo",
  studioUrl: "https://dezo.in",
  title: "Forensic Scientist, AI Developer & Cybersecurity Engineer",
  base: "India",
  responseTime: "under 24 hours",
  accepting: "Q3 2026 engagements",
  services: [
    "Forensic science and digital evidence",
    "Cybersecurity engineering",
    "AI systems, RAG, and agents",
    "Full-stack product engineering",
    "Automation and workflows",
    "0→1 founding and studio work via Dezo.in",
  ],
  notes: [
    "Public site: tarikislam.in — details always start there.",
    "Dezo.in is the founding studio for AI-native, secure-by-design products.",
    "Do not invent prices, fake case results, or unpublished credentials.",
    "Portfolio and timeline stay sealed until Tarik verifies them — invite a direct chat instead.",
    "Response promise on the site: under 24 hours.",
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
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    cached = {
      ...CANONICAL,
      title: titleMatch?.[1]?.replace(/\s*[—|-].*$/, "").includes("Forensic")
        ? CANONICAL.title
        : CANONICAL.title,
      notes: [
        ...CANONICAL.notes,
        text.toLowerCase().includes("q3 2026")
          ? "Site still lists Q3 2026 engagements as open."
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
