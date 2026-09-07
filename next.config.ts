import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Node instrumentation starts the always-live WhatsApp reconnect loop.
  serverExternalPackages: [
    "@whiskeysockets/baileys",
    "@huggingface/transformers",
    "pino",
    "qrcode",
  ],
};

export default nextConfig;
