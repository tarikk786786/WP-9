import { createHash } from "node:crypto";

export interface CachedWebPage {
  url: string;
  urlHash: string;
  content: string;
  contentHash: string;
  title: string;
  retrievedAt: number;
  expiresAt: number;
  etag?: string;
  lastModified?: string;
}

export class WebCache {
  private cache = new Map<string, CachedWebPage>();
  private readonly defaultTtlMs: number;
  private readonly maxEntries: number;

  constructor(options?: { defaultTtlMs?: number; maxEntries?: number }) {
    this.defaultTtlMs = options?.defaultTtlMs ?? 30 * 60 * 1000; // 30 minutes default
    this.maxEntries = options?.maxEntries ?? 250;
  }

  public hashUrl(url: string): string {
    return createHash("sha256").update(url.trim().toLowerCase()).digest("hex").slice(0, 16);
  }

  public hashContent(content: string): string {
    return createHash("sha256").update(content).digest("hex").slice(0, 16);
  }

  public get(url: string): CachedWebPage | null {
    const key = this.hashUrl(url);
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry;
  }

  public set(params: {
    url: string;
    content: string;
    title?: string;
    ttlMs?: number;
    etag?: string;
    lastModified?: string;
  }): CachedWebPage {
    const urlHash = this.hashUrl(params.url);
    const contentHash = this.hashContent(params.content);
    const now = Date.now();
    const ttl = params.ttlMs ?? this.defaultTtlMs;

    if (this.cache.size >= this.maxEntries) {
      // Evict oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    const item: CachedWebPage = {
      url: params.url,
      urlHash,
      content: params.content,
      contentHash,
      title: params.title ?? "",
      retrievedAt: now,
      expiresAt: now + ttl,
      etag: params.etag,
      lastModified: params.lastModified,
    };

    this.cache.set(urlHash, item);
    return item;
  }

  public clear(): void {
    this.cache.clear();
  }

  public size(): number {
    return this.cache.size;
  }
}

export const webCache = new WebCache();
