import { NextResponse } from "next/server";
import { parseRules } from "@/lib/rules";
import { getRules, resetRules, saveRules } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ rules: await getRules() });
}

export async function PUT(request: Request) {
  const body = await request.json();
  const parsed = parseRules(body);
  if (!parsed) {
    return NextResponse.json({ error: "Those reply rules are not valid." }, { status: 400 });
  }
  return NextResponse.json({ rules: await saveRules(parsed) });
}

export async function DELETE() {
  return NextResponse.json({ rules: await resetRules() });
}
