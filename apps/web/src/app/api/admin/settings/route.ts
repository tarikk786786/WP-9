import { NextResponse } from "next/server";
import { isRateLimited } from "@/lib/rate-limit";
import { workerFetch } from "@/lib/worker-client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await workerFetch("/settings");
    return NextResponse.json(await response.json(), { status: response.status });
  } catch {
    return NextResponse.json({ error: "Worker offline." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  if (isRateLimited("admin-settings", 30)) {
    return NextResponse.json({ error: "Rate limited." }, { status: 429 });
  }
  try {
    const response = await workerFetch("/settings", { method: "PUT", body: await request.text() });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch {
    return NextResponse.json({ error: "Worker offline." }, { status: 503 });
  }
}
