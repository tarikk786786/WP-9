import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function unique(paths: string[]) {
  return [...new Set(paths)];
}

/** Every disk we can keep forever — laptop/VPS `./data` first, then /tmp on serverless. */
export function persistRoots() {
  const local = path.join(process.cwd(), "data");
  const tmp = path.join("/tmp", "relay-data");
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return unique([local, tmp]);
  }
  return unique([local]);
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
      // Try the next root (serverless may block cwd).
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
