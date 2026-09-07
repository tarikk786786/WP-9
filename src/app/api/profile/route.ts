import { NextResponse } from "next/server";
import { refreshTarikProfile } from "@/lib/tarik-profile";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await refreshTarikProfile());
}

export async function POST() {
  return NextResponse.json(await refreshTarikProfile());
}
