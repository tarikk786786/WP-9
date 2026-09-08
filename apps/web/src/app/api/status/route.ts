import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    configured: true,
    channel: "baileys-worker",
    note: "WhatsApp Cloud API is not used. Link a normal account via the worker.",
  });
}
