import { NextResponse } from "next/server";
import { workerFetch } from "@/lib/worker-client";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const res = await workerFetch("/outbox/retry", { method: "POST" });
    const json = await res.json();
    return NextResponse.json(json, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Worker unreachable" }, { status: 503 });
  }
}
