import { NextResponse } from "next/server";
import { importSessionArchive } from "@/lib/session-persist";
import { hydrateScanSnapshot } from "@/lib/scan-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Saved login JSON padha nahi." }, { status: 400 });
  }

  const ok = await importSessionArchive(body);
  if (!ok) {
    return NextResponse.json(
      { error: "Saved login invalid hai. Naya QR scan karo." },
      { status: 400 },
    );
  }

  return NextResponse.json(await hydrateScanSnapshot());
}
