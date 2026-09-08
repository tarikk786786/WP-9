import { NextResponse } from "next/server";
import { isRateLimited } from "@/lib/rate-limit";
import { workerFetch } from "@/lib/worker-client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await workerFetch("/inbox");
    return NextResponse.json(await response.json(), { status: response.status });
  } catch {
    return NextResponse.json({ messages: [], conversations: [], customers: [], error: "Worker offline." }, { status: 200 });
  }
}

export async function POST(request: Request) {
  if (isRateLimited("admin-inbox", 40)) {
    return NextResponse.json({ error: "Rate limited." }, { status: 429 });
  }
  try {
    const body = await request.text();
    const response = await workerFetch("/conversations/status", { method: "POST", body });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch {
    return NextResponse.json({ error: "Worker offline." }, { status: 503 });
  }
}
