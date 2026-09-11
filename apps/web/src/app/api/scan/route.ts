import { NextResponse } from "next/server";
import { hydrateScanSnapshot } from "@/lib/scan-session";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await hydrateScanSnapshot(), {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
}

export async function POST() {
  try {
    const { startScanSession } = await import("@/lib/scan-session");
    return NextResponse.json(await startScanSession());
  } catch {
    return NextResponse.json({ phase: "idle", error: "Worker offline." }, { status: 503 });
  }
}

export async function DELETE() {
  const { logoutScanSession } = await import("@/lib/scan-session");
  return NextResponse.json(await logoutScanSession());
}
