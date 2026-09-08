import { NextResponse } from "next/server";
import { isRateLimited } from "@/lib/rate-limit";
import { workerFetch } from "@/lib/worker-client";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (isRateLimited("admin-knowledge", 20)) {
    return NextResponse.json({ error: "Rate limited." }, { status: 429 });
  }
  try {
    const response = await workerFetch("/knowledge", { method: "POST", body: await request.text() });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch {
    return NextResponse.json({ error: "Worker offline." }, { status: 503 });
  }
}
