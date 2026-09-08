import { NextResponse } from "next/server";
import { workerFetch } from "@/lib/worker-client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await workerFetch("/health");
    const body = await response.json();
    return NextResponse.json({ web: "ok", worker: body }, { status: response.ok ? 200 : 503 });
  } catch {
    return NextResponse.json(
      { web: "ok", worker: { worker: "down", error: "Baileys worker is not reachable. Run npm run worker." } },
      { status: 200 },
    );
  }
}
