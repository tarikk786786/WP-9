import { NextResponse } from "next/server";
import { getInbox } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ messages: await getInbox() });
}
