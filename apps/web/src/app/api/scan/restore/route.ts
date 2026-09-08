import { NextResponse } from "next/server";
import { workerFetch } from "@/lib/worker-client";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const response = await workerFetch("/session/restore", { method: "POST", body: body || "{}" });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch {
    return NextResponse.json({ error: "Worker offline. Import the login on the worker host." }, { status: 503 });
  }
}
