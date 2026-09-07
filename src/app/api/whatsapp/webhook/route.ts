import { NextRequest, NextResponse } from "next/server";
import { decideReply } from "@/lib/reply-engine";
import { addInboxMessage, getRules, markProcessed, wasProcessed } from "@/lib/store";
import {
  extractIncomingTexts,
  getWhatsAppConfig,
  sendWhatsAppText,
  verifyWebhookSignature,
} from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  const { verifyToken } = getWhatsAppConfig();

  if (mode === "subscribe" && token && verifyToken && token === verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Webhook verification failed." }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!verifyWebhookSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const incoming = extractIncomingTexts(payload as Parameters<typeof extractIncomingTexts>[0]);
  const rules = await getRules();

  for (const message of incoming) {
    if (await wasProcessed(message.id)) continue;
    await markProcessed(message.id);

    const decision = decideReply(message.body, message.fromName, rules);
    if (decision.action === "skip") {
      await addInboxMessage({
        id: message.id,
        from: message.from,
        fromName: message.fromName,
        body: message.body,
        reply: null,
        skippedReason: decision.reason,
        source: "whatsapp",
        createdAt: new Date().toISOString(),
      });
      continue;
    }

    try {
      await sendWhatsAppText(message.from, decision.text);
      await addInboxMessage({
        id: message.id,
        from: message.from,
        fromName: message.fromName,
        body: message.body,
        reply: decision.text,
        skippedReason: null,
        source: "whatsapp",
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      await addInboxMessage({
        id: message.id,
        from: message.from,
        fromName: message.fromName,
        body: message.body,
        reply: null,
        skippedReason: error instanceof Error ? error.message : "Send failed.",
        source: "whatsapp",
        createdAt: new Date().toISOString(),
      });
    }
  }

  return NextResponse.json({ ok: true });
}
