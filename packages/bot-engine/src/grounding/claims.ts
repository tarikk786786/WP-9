/**
 * Claim Extractor
 * Identifies key factual assertions in candidate answers
 * (prices, dates, locations, phone numbers, contact links, guarantees).
 */

export interface FactualClaim {
  id: string;
  claimType: 'price' | 'contact' | 'location' | 'date' | 'fact';
  statement: string;
  exactMatch?: string;
  confidence: number;
}

export class ClaimExtractor {
  public extractClaims(text: string): FactualClaim[] {
    if (!text || typeof text !== 'string') return [];

    const claims: FactualClaim[] = [];
    let count = 1;

    // 1. Price claims (e.g. ₹500, 10,000 INR, $50, 5000 rs, 200/hr)
    const priceRegex = /(?:₹|\$|Rs\.?|INR)\s*[\d,]+(?:\.\d+)?|\b[\d,]+\s*(?:rupees|dollars|rs|inr)\b/gi;
    let priceMatch: RegExpExecArray | null;
    while ((priceMatch = priceRegex.exec(text)) !== null) {
      claims.push({
        id: `claim_${count++}`,
        claimType: 'price',
        statement: `States price: ${priceMatch[0]}`,
        exactMatch: priceMatch[0],
        confidence: 0.95,
      });
    }

    // 2. Contact link / email / URL claims
    const urlRegex = /https?:\/\/[^\s]+/gi;
    let urlMatch: RegExpExecArray | null;
    while ((urlMatch = urlRegex.exec(text)) !== null) {
      claims.push({
        id: `claim_${count++}`,
        claimType: 'contact',
        statement: `Provides URL link: ${urlMatch[0]}`,
        exactMatch: urlMatch[0],
        confidence: 0.98,
      });
    }

    // 3. Location claims (e.g. Delhi, Muzaffarpur, India, Remote)
    const locationRegex = /\b(?:Delhi|Muzaffarpur|Bihar|India|Bengaluru|Bangalore|Mumbai)\b/gi;
    let locMatch: RegExpExecArray | null;
    while ((locMatch = locationRegex.exec(text)) !== null) {
      claims.push({
        id: `claim_${count++}`,
        claimType: 'location',
        statement: `States location: ${locMatch[0]}`,
        exactMatch: locMatch[0],
        confidence: 0.9,
      });
    }

    return claims;
  }
}

export const claimExtractor = new ClaimExtractor();
