import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function unique(paths: string[]) {
  return [...new Set(paths)];
}

/** Vercel/Lambda: only /tmp is writable. Never mkdir under /var/task. */
export function isServerlessDisk() {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.LAMBDA_TASK_ROOT ||
      process.cwd() === "/var/task",
  );
}

/** Disk roots we may write. Serverless = /tmp only. Laptop/VPS = ./data. */
export function persistRoots() {
  const tmp = path.join("/tmp", "relay-data");
  if (isServerlessDisk()) {
    return [tmp];
  }
  return unique([path.join(process.cwd(), "data")]);
}

export function writableRoot() {
  return persistRoots()[0];
}

export function writablePath(...parts: string[]) {
  return path.join(writableRoot(), ...parts);
}

export async function writeToAllRoots(relPath: string, data: string | Buffer) {
  let wrote = false;
  for (const root of persistRoots()) {
    try {
      const dest = path.join(root, relPath);
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, data);
      wrote = true;
    } catch {
      // Next root (should not happen on /tmp).
    }
  }
  return wrote;
}

export async function readFirstExisting(relPath: string): Promise<string | null> {
  for (const root of persistRoots()) {
    try {
      return await readFile(path.join(root, relPath), "utf8");
    } catch {
      // keep looking
    }
  }
  return null;
}

export function firstExistingPath(...parts: string[]) {
  for (const root of persistRoots()) {
    const full = path.join(root, ...parts);
    if (existsSync(full)) return full;
  }
  return path.join(writableRoot(), ...parts);
}
