import { NextResponse } from "next/server";
import { GRAPH_API_VERSION, getWhatsAppConfig, isWhatsAppConfigured } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = getWhatsAppConfig();
  return NextResponse.json({
    configured: isWhatsAppConfigured(),
    hasAccessToken: Boolean(config.accessToken),
    hasPhoneNumberId: Boolean(config.phoneNumberId),
    hasVerifyToken: Boolean(config.verifyToken),
    hasAppSecret: Boolean(config.appSecret),
    graphApiVersion: GRAPH_API_VERSION,
  });
}
