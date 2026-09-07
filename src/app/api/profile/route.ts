import { NextResponse } from "next/server";
import { getTarikProfile, refreshTarikProfile } from "@/lib/tarik-profile";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getTarikProfile());
}

export async function POST() {
  return NextResponse.json(await refreshTarikProfile());
}
