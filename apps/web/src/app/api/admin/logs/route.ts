import { NextResponse } from "next/server";
import { workerFetch } from "@/lib/worker-client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await workerFetch("/logs");
    return NextResponse.json(await response.json(), { status: response.status });
  } catch {
    return NextResponse.json({ logs: [], error: "Worker offline." });
  }
}
