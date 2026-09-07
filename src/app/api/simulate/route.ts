import { NextResponse } from "next/server";
import { composeReply } from "@/lib/compose-reply";
import { recordReply } from "@/lib/record-reply";
import { getRules } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const body = (await request.json()) as { fromName?: string; text?: string };
  const text = body.text?.trim() ?? "";
  const fromName = body.fromName?.trim() || "Test contact";

  if (!text) {
    return NextResponse.json({ error: "Write a message to simulate." }, { status: 400 });
  }

  const rules = await getRules();
  const decision = await composeReply({
    text,
    fromName,
    fromId: `sim:${fromName}`,
    rules,
  });
  const message = await recordReply(
    {
      id: `sim_${Date.now()}`,
      from: "simulator",
      fromName,
      body: text,
      source: "simulator",
      createdAt: new Date().toISOString(),
    },
    decision,
  );

  return NextResponse.json({ message, decision });
}
