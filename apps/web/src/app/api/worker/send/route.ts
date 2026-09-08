import { NextResponse } from "next/server";
import { SendMessageBody } from "@bot/shared";
import { isRateLimited } from "@/lib/rate-limit";
import { workerFetch } from "@/lib/worker-client";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (isRateLimited("worker-send", 20)) {
    return NextResponse.json({ error: "Rate limited." }, { status: 429 });
  }
  const parsed = SendMessageBody.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "chatId and message required." }, { status: 400 });
  }
  try {
    const response = await workerFetch("/send", {
      method: "POST",
      body: JSON.stringify(parsed.data),
    });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch {
    return NextResponse.json({ error: "Worker offline." }, { status: 503 });
  }
}
