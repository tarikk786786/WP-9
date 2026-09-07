import path from "node:path";

/** Vercel functions can only write under /tmp. Locally we use ./data. */
export function writableRoot() {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return path.join("/tmp", "relay-data");
  }
  return path.join(process.cwd(), "data");
}

export function writablePath(...parts: string[]) {
  return path.join(writableRoot(), ...parts);
}
