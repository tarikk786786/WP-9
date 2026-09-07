import { NextResponse } from "next/server";
import { getScanSnapshot, logoutScanSession, startScanSession } from "@/lib/scan-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  return NextResponse.json(getScanSnapshot());
}

export async function POST() {
  const snapshot = await startScanSession();
  return NextResponse.json(snapshot);
}

export async function DELETE() {
  const snapshot = await logoutScanSession();
  return NextResponse.json(snapshot);
}
