export type MemoryCategory =
  | "preference"
  | "requirement"
  | "project"
  | "timeline"
  | "budget"
  | "business_info";

export interface MemoryCandidate {
  category: MemoryCategory;
  key: string;
  value: string;
  confidence: number;
}

const TRANSIENT_CHATTER = /^(hi|hello|hey|yo|hlo|helo|ok|okay|ok done|theek|thik|theek hai|thik hai|sahi|sahi hai|accha|acha|hmm|haan|han|done|cool|nice|good|bye|gn|gm|good night|good morning|kya haal|bolo)[\s!.]*$/i;

export function isTransientMessage(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  return TRANSIENT_CHATTER.test(trimmed);
}

const SENSITIVE_PATTERNS = [
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, // Aadhaar-like 12 digits
  /\b[A-Z]{5}\d{4}[A-Z]\b/,          // Indian PAN card
  /\b\d{16}\b|\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, // Credit / Debit Card
  /\b(password|pin|otp|secret|cvv)\s*[:=]\s*\S+/i,
];

export function containsSensitiveData(text: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(text));
}

export function detectMemoryCandidates(text: string): MemoryCandidate[] {
  const candidates: MemoryCandidate[] = [];
  const trimmed = text.trim();

  // If transient or containing sensitive data, do not extract long-term memory
  if (isTransientMessage(trimmed) || containsSensitiveData(trimmed)) {
    return candidates;
  }

  // 1. Language Preference
  if (/\b(hindi mein|in hindi|hindi me bolo)\b/i.test(trimmed)) {
    candidates.push({
      category: "preference",
      key: "preferred_language",
      value: "hindi",
      confidence: 0.95,
    });
  } else if (/\b(in english|english please|speak english)\b/i.test(trimmed)) {
    candidates.push({
      category: "preference",
      key: "preferred_language",
      value: "english",
      confidence: 0.95,
    });
  } else if (/\b(odia|odia re)\b/i.test(trimmed)) {
    candidates.push({
      category: "preference",
      key: "preferred_language",
      value: "odia",
      confidence: 0.95,
    });
  }

  // 2. Budget Mentions
  const budgetMatch = trimmed.match(/(?:budget|cost|price|around|under|upto)\s*(?:is|of|hai)?\s*(?:₹|rs\.?|inr)?\s*(\d{2,3}(?:,\d{3})*|\d+)\s*(?:k|thousand|lakh)?/i);
  if (budgetMatch) {
    candidates.push({
      category: "budget",
      key: "budget_target",
      value: budgetMatch[0].trim(),
      confidence: 0.88,
    });
  }

  // 3. Project / Service Requirement
  const websiteMatch = trimmed.match(/\b(?:need|want|build|make|develop|redesign)\s+(?:a\s+)?(?:new\s+)?(website|web app|ecommerce|mobile app|portfolio|dashboard|crm|saas)\b/i);
  if (websiteMatch) {
    candidates.push({
      category: "requirement",
      key: "project_type",
      value: websiteMatch[1].toLowerCase(),
      confidence: 0.92,
    });
  }

  // 4. Timeline / Deadline
  const deadlineMatch = trimmed.match(/\b(?:by|before|within|deadline is)\s+(\d+\s+(?:days?|weeks?|months?)|next\s+(?:week|month)|tomorrow|monday|friday)\b/i);
  if (deadlineMatch) {
    candidates.push({
      category: "timeline",
      key: "target_deadline",
      value: deadlineMatch[1].toLowerCase(),
      confidence: 0.85,
    });
  }

  // 5. Business / Brand Information
  const brandMatch = trimmed.match(/\b(?:my|our)\s+(?:company|brand|business|store|startup|shop)\s+(?:is|name is|called)\s+([A-Z0-9][A-Za-z0-9\s&'-]{2,25})\b/);
  if (brandMatch) {
    candidates.push({
      category: "business_info",
      key: "brand_name",
      value: brandMatch[1].trim(),
      confidence: 0.85,
    });
  }

  return candidates;
}
