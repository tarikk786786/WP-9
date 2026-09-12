export interface ExtractedContent {
  title: string;
  cleanText: string;
  summary: string;
  keyFacts: string[];
  wordCount: number;
}

export class ContentExtractor {
  public extract(rawHtmlOrText: string, defaultTitle = ""): ExtractedContent {
    let text = rawHtmlOrText;

    // 1. Extract title if present
    const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : defaultTitle;

    // 2. Strip scripts, styles, iframes, nav, footer, header
    text = text
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
      .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
      .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, " ")
      .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ")
      .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ")
      .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, " ");

    // 3. Convert basic structural tags to whitespace/newlines
    text = text
      .replace(/<\/(p|div|section|article|h[1-6]|li)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ");

    // 4. Decode common HTML entities
    text = text
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    // 5. Clean excessive whitespace
    const cleanLines = text
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter((line) => line.length > 0);

    const cleanText = cleanLines.join("\n");
    const words = cleanText.split(/\s+/).filter(Boolean);

    // 6. Extract key facts (sentences containing numbers, dates, currency, or definitive claims)
    const sentences = cleanText.split(/(?<=[.?!])\s+/);
    const keyFacts = sentences
      .filter((s) => {
        const hasNumbers = /\d+/.test(s);
        const hasKeywords = /\b(is|are|was|were|released|priced|located|announced|updated|born|established)\b/i.test(s);
        return s.length >= 25 && s.length <= 250 && (hasNumbers || hasKeywords);
      })
      .slice(0, 8);

    // 7. Generate brief summary
    const summary = cleanLines.slice(0, 3).join(" ").slice(0, 300);

    return {
      title,
      cleanText: cleanText.slice(0, 10000), // Bounded length
      summary,
      keyFacts,
      wordCount: words.length,
    };
  }
}

export const contentExtractor = new ContentExtractor();
