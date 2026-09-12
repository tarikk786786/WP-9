import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  transpilePackages: ["@bot/shared", "@bot/engine", "@bot/database"],
  outputFileTracingRoot: root,
  serverExternalPackages: ["pino", "qrcode", "@huggingface/transformers"],
  turbopack: {
    resolveAlias: {
      cn: "./src/lib/cn.ts",
    },
  },
};

export default nextConfig;
