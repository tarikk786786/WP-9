import { NextResponse } from "next/server";
import { discoverLocalLlms } from "@/lib/local-llm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ endpoints: await discoverLocalLlms() });
}
