import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Import login on the worker host. Vercel does not store Baileys credentials. Copy creds into the worker data/baileys-auth directory or Supabase baileys_auth table.",
    },
    { status: 410 },
  );
}
