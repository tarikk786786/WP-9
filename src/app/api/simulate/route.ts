import { NextResponse } from "next/server";
import { decideReply } from "@/lib/reply-engine";
import { addInboxMessage, getRules } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { fromName?: string; text?: string };
  const text = body.text?.trim() ?? "";
  const fromName = body.fromName?.trim() || "Test contact";

  if (!text) {
    return NextResponse.json({ error: "Write a message to simulate." }, { status: 400 });
  }

  const rules = await getRules();
  const decision = decideReply(text, fromName, rules);
  const message = await addInboxMessage({
    id: `sim_${Date.now()}`,
    from: "simulator",
    fromName,
    body: text,
    reply: decision.action === "reply" ? decision.text : null,
    skippedReason: decision.action === "skip" ? decision.reason : null,
    source: "simulator",
    createdAt: new Date().toISOString(),
  });

  return NextResponse.json({ message, decision });
}
