import { NextResponse } from "next/server";
import { exportSessionArchive } from "@/lib/session-persist";
import { hydrateScanSnapshot } from "@/lib/scan-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const archive = await exportSessionArchive();
  const snapshot = await hydrateScanSnapshot();
  return NextResponse.json({ archive, snapshot });
}
