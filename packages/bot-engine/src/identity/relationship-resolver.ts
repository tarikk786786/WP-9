import { BUILTIN_PROFILES, type ContactProfile, type RelationshipType } from "./contact-profile-model.ts";
import { normalizePhoneNumber } from "./phone-normalizer.ts";

export class RelationshipResolver {
  private profiles: ContactProfile[] = [...BUILTIN_PROFILES];

  public resolveProfile(input: {
    jid?: string;
    senderNumber?: string;
    lid?: string;
    displayName?: string;
  }): ContactProfile | null {
    const rawDigits = normalizePhoneNumber(input.senderNumber || input.jid || "");
    const cleanLid = input.lid ? input.lid.replace(/\D/g, "") : "";
    const cleanName = (input.displayName || "").trim().toLowerCase();

    for (const profile of this.profiles) {
      // 1. Match phone numbers
      if (rawDigits && profile.phoneNumbers.some((num) => rawDigits.endsWith(num) || num.endsWith(rawDigits))) {
        return profile;
      }

      // 2. Match LIDs
      if (cleanLid && profile.lids && profile.lids.includes(cleanLid)) {
        return profile;
      }

      // 3. Match aliases if name provided
      if (cleanName && profile.aliases && profile.aliases.includes(cleanName)) {
        return profile;
      }
    }

    return null;
  }

  public resolveRelationship(input: {
    jid?: string;
    senderNumber?: string;
    lid?: string;
    displayName?: string;
  }): RelationshipType {
    const profile = this.resolveProfile(input);
    return profile?.relationshipType ?? "unknown";
  }
}

export const relationshipResolver = new RelationshipResolver();
