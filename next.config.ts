import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@whiskeysockets/baileys",
    "@huggingface/transformers",
    "pino",
    "qrcode",
  ],
};

export default nextConfig;
