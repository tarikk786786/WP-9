import { NextResponse } from "next/server";
import { hydrateScanSnapshot } from "@/lib/scan-session";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await hydrateScanSnapshot());
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
