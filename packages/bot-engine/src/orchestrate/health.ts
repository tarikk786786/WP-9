export type ProviderHealth = {
  success: number;
  fail: number;
  lastFailAt: number;
  lastLatencyMs: number;
};

const health = new Map<string, ProviderHealth>();

export function recordSuccess(id: string, latencyMs: number) {
  const row = health.get(id) ?? { success: 0, fail: 0, lastFailAt: 0, lastLatencyMs: 0 };
  row.success += 1;
  row.lastLatencyMs = latencyMs;
  health.set(id, row);
}

export function recordFailure(id: string) {
  const row = health.get(id) ?? { success: 0, fail: 0, lastFailAt: 0, lastLatencyMs: 0 };
  row.fail += 1;
  row.lastFailAt = Date.now();
  health.set(id, row);
}

export function isUnhealthy(id: string) {
  const row = health.get(id);
  if (!row) return false;
  if (row.fail >= 3 && row.fail > row.success && Date.now() - row.lastFailAt < 5 * 60_000) return true;
  return false;
}

export function providerScore(id: string, base: { quality: number; speed: number; cost: number; reasoning: number }) {
  const row = health.get(id);
  const availability = row && row.fail + row.success > 0 ? row.success / (row.success + row.fail) : 0.8;
  return base.quality * 0.35 + base.reasoning * 0.25 + base.speed * 0.15 + availability * 0.2 - base.cost * 0.2;
}

export function resetHealth() {
  health.clear();
}
