export type RelationshipType =
  | "romantic_partner"
  | "client"
  | "colleague"
  | "friend"
  | "admin"
  | "lead"
  | "unknown";

export interface ContactProfile {
  contactId: string;
  displayName: string;
  phoneNumbers: string[];
  lids?: string[];
  aliases?: string[];
  language: string;
  tone: string;
  warmth: number; // 0 to 100
  humor: number; // 0 to 100
  romanceLevel: number; // 0 to 4
  formality: number; // 0 to 100
  emojiLevel: number; // 0 to 100
  memoryEnabled: boolean;
  webResearchEnabled: boolean;
  toolPermissions: string[];
  relationshipType: RelationshipType;
  privateLexiconId?: string;
  notes?: string;
}

export const BUILTIN_PROFILES: ContactProfile[] = [
  {
    contactId: "dazy",
    displayName: "DAZY",
    phoneNumbers: ["917903956968", "7903956968"],
    lids: ["232839253623024"],
    aliases: ["dazy", "dazzy", "daazy", "my love", "jaan"],
    language: "hinglish",
    tone: "romantic_affectionate",
    warmth: 100,
    humor: 60,
    romanceLevel: 4,
    formality: 0,
    emojiLevel: 90,
    memoryEnabled: true,
    webResearchEnabled: false,
    toolPermissions: ["calculate", "get_weather"],
    relationshipType: "romantic_partner",
    privateLexiconId: "dazy_lexicon",
    notes: "Special private contact. Tarik's love. Must receive deep affection and humble warmth.",
  },
  {
    contactId: "tarik_admin",
    displayName: "Tarik Islam (Admin)",
    phoneNumbers: ["919114411026", "9114411026"],
    aliases: ["tarik", "admin", "owner"],
    language: "english",
    tone: "professional_direct",
    warmth: 75,
    humor: 40,
    romanceLevel: 0,
    formality: 30,
    emojiLevel: 40,
    memoryEnabled: true,
    webResearchEnabled: true,
    toolPermissions: ["*"], // All permissions
    relationshipType: "admin",
    notes: "Owner of the WhatsApp account and bot administrator.",
  },
];

export const DEFAULT_CUSTOMER_PROFILE: ContactProfile = {
  contactId: "default_customer",
  displayName: "Client",
  phoneNumbers: [],
  language: "hinglish",
  tone: "warm_respectful",
  warmth: 85,
  humor: 30,
  romanceLevel: 0,
  formality: 35,
  emojiLevel: 50,
  memoryEnabled: true,
  webResearchEnabled: true,
  toolPermissions: ["read_knowledge", "calculate", "get_weather", "search_web"],
  relationshipType: "client",
};
