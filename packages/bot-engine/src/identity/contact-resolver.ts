import { parseJid, type ParsedJid } from "./jid-resolver.ts";
import { normalizePhoneNumber } from "./phone-normalizer.ts";
import { relationshipResolver } from "./relationship-resolver.ts";
import { DEFAULT_CUSTOMER_PROFILE, type ContactProfile, type RelationshipType } from "./contact-profile-model.ts";

export interface ContactIdentity {
  contactId: string;
  phone: string;
  jid: string;
  lid?: string;
  displayName: string;
  normalizedPhone: string;
  aliases: string[];
  relationship: RelationshipType;
  tenant: string;
  permissions: string[];
  preferences: Record<string, unknown>;
  profile: ContactProfile;
  isDazy: boolean;
  isAdmin: boolean;
}

export class ContactResolver {
  private cache = new Map<string, ContactIdentity>();

  public resolve(params: {
    jid: string;
    senderNumber?: string;
    fromName?: string;
    tenantId?: string;
  }): ContactIdentity {
    const key = `${params.tenantId || "default"}:${params.jid}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const parsed: ParsedJid = parseJid(params.jid);
    const phone = parsed.phoneDigits || normalizePhoneNumber(params.senderNumber || "");
    const displayName = params.fromName || (phone ? `+${phone}` : "WhatsApp User");

    const matchedProfile = relationshipResolver.resolveProfile({
      jid: params.jid,
      senderNumber: phone,
      lid: parsed.lid,
      displayName,
    });

    const profile: ContactProfile = matchedProfile ?? {
      ...DEFAULT_CUSTOMER_PROFILE,
      contactId: `customer_${phone || parsed.lid || "unknown"}`,
      displayName,
      phoneNumbers: phone ? [phone] : [],
    };

    const isDazy = profile.contactId === "dazy" || profile.relationshipType === "romantic_partner";
    const isAdmin = profile.relationshipType === "admin";

    const identity: ContactIdentity = {
      contactId: profile.contactId,
      phone,
      jid: params.jid,
      lid: parsed.lid,
      displayName: isDazy ? "DAZY" : displayName,
      normalizedPhone: phone,
      aliases: profile.aliases || [],
      relationship: profile.relationshipType,
      tenant: params.tenantId || "default",
      permissions: profile.toolPermissions || [],
      preferences: {
        language: profile.language,
        tone: profile.tone,
        emojiLevel: profile.emojiLevel,
      },
      profile,
      isDazy,
      isAdmin,
    };

    this.cache.set(key, identity);
    return identity;
  }

  public clear(): void {
    this.cache.clear();
  }
}

export const contactResolver = new ContactResolver();

export function resolveContactIdentity(jidOrPhone: string, fromName?: string): ContactIdentity {
  return contactResolver.resolve({
    jid: jidOrPhone,
    senderNumber: jidOrPhone,
    fromName,
  });
}
