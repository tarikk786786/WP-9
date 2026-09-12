/**
 * Content-Addressed Media Registry & Deduplication
 * Calculates SHA-256 and enables instant reuse of processed artifacts.
 */

import { createHash } from 'node:crypto';

export interface MediaArtifact {
  artifactId: string;
  sha256: string;
  sizeBytes: number;
  detectedMime: string;
  extension: string;
  storageKey: string;
  createdAt: number;
}

export class ContentAddressedRegistry {
  private cache = new Map<string, MediaArtifact>();

  public computeSha256(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  public register(
    buffer: Buffer,
    meta: { detectedMime: string; extension: string }
  ): { artifact: MediaArtifact; isDuplicate: boolean } {
    const sha256 = this.computeSha256(buffer);
    const existing = this.cache.get(sha256);

    if (existing) {
      return { artifact: existing, isDuplicate: true };
    }

    const artifact: MediaArtifact = {
      artifactId: `med_${sha256.slice(0, 16)}`,
      sha256,
      sizeBytes: buffer.length,
      detectedMime: meta.detectedMime,
      extension: meta.extension,
      storageKey: `media/${sha256.slice(0, 2)}/${sha256}.${meta.extension}`,
      createdAt: Date.now(),
    };

    this.cache.set(sha256, artifact);
    return { artifact, isDuplicate: false };
  }

  public get(sha256: string): MediaArtifact | undefined {
    return this.cache.get(sha256);
  }
}

export const contentAddressedRegistry = new ContentAddressedRegistry();
