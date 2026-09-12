import { calculateAuthorityScore, type SourceType } from "../sources/source-model.ts";

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
  sourceType: SourceType;
  authorityScore: number;
  publishedDate?: string;
}

export interface SearchProvider {
  id: string;
  name: string;
  priority: number;
  isAvailable(): boolean;
  search(query: string, limit?: number): Promise<SearchResultItem[]>;
}

export class SearXNGSearchProvider implements SearchProvider {
  public id = "searxng";
  public name = "SearXNG (Self-Hosted)";
  public priority = 100;

  public isAvailable(): boolean {
    return Boolean(process.env.SEARXNG_URL);
  }

  public async search(query: string, limit = 5): Promise<SearchResultItem[]> {
    const base = process.env.SEARXNG_URL?.replace(/\/$/, "");
    if (!base) return [];

    const url = new URL(`${base}/search`);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("categories", "general");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);

    try {
      const res = await fetch(url.toString(), {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return [];

      const data = (await res.json()) as {
        results?: Array<{ title?: string; url?: string; content?: string; publishedDate?: string }>;
      };
      const items = (data.results ?? []).slice(0, limit);

      return items.map((r) => {
        const u = r.url ?? "";
        let domain = "";
        try {
          domain = new URL(u).hostname;
        } catch {
          /* ignore */
        }
        return {
          title: r.title ?? "Untitled",
          url: u,
          snippet: r.content ?? "",
          sourceType: "search_snippet",
          authorityScore: calculateAuthorityScore("search_snippet", domain),
          publishedDate: r.publishedDate,
        };
      });
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
    }
  }
}

export class BraveSearchProvider implements SearchProvider {
  public id = "brave";
  public name = "Brave Search API";
  public priority = 90;

  public isAvailable(): boolean {
    return Boolean(process.env.BRAVE_API_KEY);
  }

  public async search(query: string, limit = 5): Promise<SearchResultItem[]> {
    const apiKey = process.env.BRAVE_API_KEY;
    if (!apiKey) return [];

    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(limit));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);

    try {
      const res = await fetch(url.toString(), {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": apiKey,
        },
      });
      if (!res.ok) return [];

      const data = (await res.json()) as {
        web?: {
          results?: Array<{ title?: string; url?: string; description?: string; page_age?: string }>;
        };
      };
      const items = (data.web?.results ?? []).slice(0, limit);

      return items.map((r) => {
        const u = r.url ?? "";
        let domain = "";
        try {
          domain = new URL(u).hostname;
        } catch {
          /* ignore */
        }
        return {
          title: r.title ?? "Untitled",
          url: u,
          snippet: r.description ?? "",
          sourceType: "search_snippet",
          authorityScore: calculateAuthorityScore("search_snippet", domain),
          publishedDate: r.page_age,
        };
      });
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
    }
  }
}

export class TavilySearchProvider implements SearchProvider {
  public id = "tavily";
  public name = "Tavily Search API";
  public priority = 80;

  public isAvailable(): boolean {
    return Boolean(process.env.TAVILY_API_KEY);
  }

  public async search(query: string, limit = 5): Promise<SearchResultItem[]> {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) return [];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);

    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          search_depth: "basic",
          max_results: limit,
        }),
      });
      if (!res.ok) return [];

      const data = (await res.json()) as {
        results?: Array<{ title?: string; url?: string; content?: string }>;
      };
      const items = (data.results ?? []).slice(0, limit);

      return items.map((r) => {
        const u = r.url ?? "";
        let domain = "";
        try {
          domain = new URL(u).hostname;
        } catch {
          /* ignore */
        }
        return {
          title: r.title ?? "Untitled",
          url: u,
          snippet: r.content ?? "",
          sourceType: "search_snippet",
          authorityScore: calculateAuthorityScore("search_snippet", domain),
        };
      });
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
    }
  }
}

export class MockOrDeterministicSearchProvider implements SearchProvider {
  public id = "deterministic_fallback";
  public name = "Deterministic Fact Fallback";
  public priority = 10;

  public isAvailable(): boolean {
    return true; // Always available as graceful offline fallback
  }

  public async search(query: string, limit = 3): Promise<SearchResultItem[]> {
    const q = query.toLowerCase();
    const results: SearchResultItem[] = [];

    if (q.includes("tarik") || q.includes("islam") || q.includes("portfolio") || q.includes("developer")) {
      results.push({
        title: "Tarik Islam — Portfolio & Professional Engineering",
        url: "https://tarikislam.in",
        snippet: "Tarik Islam is a senior software engineer based in Bhubaneswar, specializing in full-stack architecture, automation, and cybersecurity.",
        sourceType: "official_primary",
        authorityScore: 100,
      });
    }

    return results.slice(0, limit);
  }
}

export class SearchProviderRegistry {
  private providers: SearchProvider[] = [];

  constructor() {
    this.register(new SearXNGSearchProvider());
    this.register(new BraveSearchProvider());
    this.register(new TavilySearchProvider());
    this.register(new MockOrDeterministicSearchProvider());
  }

  public register(provider: SearchProvider): void {
    this.providers.push(provider);
    this.providers.sort((a, b) => b.priority - a.priority);
  }

  public getAvailableProviders(): SearchProvider[] {
    return this.providers.filter((p) => p.isAvailable());
  }

  public async search(query: string, limit = 5): Promise<SearchResultItem[]> {
    const available = this.getAvailableProviders();
    for (const provider of available) {
      try {
        const results = await provider.search(query, limit);
        if (results.length > 0) {
          return results;
        }
      } catch (err) {
        console.warn(`[SearchRegistry] Provider ${provider.name} search failed:`, err);
      }
    }
    return [];
  }
}

export const searchProviderRegistry = new SearchProviderRegistry();
