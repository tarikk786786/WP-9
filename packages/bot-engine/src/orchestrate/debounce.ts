export type BurstItem<T> = { item: T; at: number };

const bursts = new Map<string, { timer: ReturnType<typeof setTimeout>; items: BurstItem<unknown>[] }>();

/** Combine rapid messages from the same chat into one flush. */
export function debounceChat<T>(key: string, item: T, flush: (items: T[]) => void, waitMs = 400) {
  const existing = bursts.get(key);
  if (existing) clearTimeout(existing.timer);
  const items = [...((existing?.items as BurstItem<T>[] | undefined) ?? []), { item, at: Date.now() }] as BurstItem<T>[];
  const timer = setTimeout(() => {
    bursts.delete(key);
    flush(items.map((row) => row.item));
  }, waitMs);
  bursts.set(key, { timer, items: items as BurstItem<unknown>[] });
}

export function combineBurstText(texts: string[]) {
  return texts.map((text) => text.trim()).filter(Boolean).join("\n");
}

export function clearDebounce(key?: string) {
  if (key) {
    const row = bursts.get(key);
    if (row) clearTimeout(row.timer);
    bursts.delete(key);
    return;
  }
  for (const row of bursts.values()) clearTimeout(row.timer);
  bursts.clear();
}
