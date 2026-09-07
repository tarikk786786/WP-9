import { NextResponse } from "next/server";
import { getLiveStatus, keepAliveTick } from "@/lib/live";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  await keepAliveTick();
  return NextResponse.json(await getLiveStatus());
}
