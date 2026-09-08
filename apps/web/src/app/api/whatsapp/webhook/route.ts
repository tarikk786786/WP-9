import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { error: "Meta WhatsApp Cloud API is not used. Connect a normal WhatsApp account through the Baileys worker." },
    { status: 410 },
  );
}

export async function POST() {
  return NextResponse.json(
    { error: "Meta WhatsApp Cloud API is not used." },
    { status: 410 },
  );
}
