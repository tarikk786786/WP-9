import { NextResponse } from "next/server";
import { workerFetch } from "@/lib/worker-client";
import { hydrateScanSnapshot } from "@/lib/scan-session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await workerFetch("/session/archive");
    if (res.ok) {
      const archive = await res.json();
      const snapshot = await hydrateScanSnapshot();
      return NextResponse.json({ archive, snapshot });
    }
  } catch {
    /* fallback */
  }

  return NextResponse.json({
    archive: null,
    snapshot: await hydrateScanSnapshot(),
  });
}
