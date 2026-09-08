import { NextResponse } from "next/server";
import { workerFetch } from "@/lib/worker-client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await workerFetch("/status");
    const json = (await response.json()) as { health?: { whatsapp?: unknown } };
    return NextResponse.json(json.health?.whatsapp ?? { phase: "idle" });
  } catch {
    return NextResponse.json({ phase: "idle", error: "Worker offline. Run npm run worker." });
  }
}

export async function POST() {
  try {
    const response = await workerFetch("/session/start", { method: "POST", body: "{}" });
    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json({ phase: "idle", error: "Worker offline." }, { status: 503 });
  }
}

export async function DELETE() {
  try {
    const response = await workerFetch("/session", { method: "DELETE" });
    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json({ phase: "logged_out" });
  }
}
