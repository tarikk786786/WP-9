import { existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

export function lockFile(dir: string) {
  return path.join(dir, "worker.lock");
}

export function pidIsAlive(pid: number) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function readLockPid(file: string): number | null {
  try {
    const n = Number(String(readFileSync(file, "utf8")).trim());
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export type LockResult = { ok: true; file: string } | { ok: false; pid: number };

export function acquireWorkerLock(dir: string, pid = process.pid): LockResult {
  mkdirSync(dir, { recursive: true });
  const file = lockFile(dir);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (existsSync(file)) {
      const existing = readLockPid(file);
      if (existing && existing !== pid && pidIsAlive(existing)) {
        return { ok: false, pid: existing };
      }
      try {
        unlinkSync(file);
      } catch {
        /* stale lock */
      }
    }
    try {
      const fd = openSync(file, "wx");
      writeFileSync(fd, `${pid}\n`);
      return { ok: true, file };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EEXIST") {
        const existing = readLockPid(file);
        if (existing && existing !== pid && pidIsAlive(existing)) {
          return { ok: false, pid: existing };
        }
        continue;
      }
      throw error;
    }
  }
  const existing = readLockPid(file);
  if (existing && existing !== pid && pidIsAlive(existing)) {
    return { ok: false, pid: existing };
  }
  return { ok: true, file };
}

export function releaseWorkerLock(dir: string, pid = process.pid) {
  const file = lockFile(dir);
  const existing = readLockPid(file);
  if (existing && existing !== pid) return;
  try {
    unlinkSync(file);
  } catch {
    /* already gone */
  }
}
