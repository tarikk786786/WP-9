import { NextResponse } from "next/server";
import { workerFetch } from "@/lib/worker-client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await workerFetch("/status");
    return NextResponse.json(await response.json(), { status: response.status });
  } catch {
    return NextResponse.json({ error: "Worker offline. Start npm run worker." }, { status: 503 });
  }
}
