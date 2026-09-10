import { NextResponse } from "next/server";
import { loadWorkerHeartbeat } from "@bot/database";
import { workerFetch } from "@/lib/worker-client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await workerFetch("/status");
    return NextResponse.json(await response.json(), { status: response.status });
  } catch {
    try {
      const hb = await loadWorkerHeartbeat();
      if (hb && Date.now() - new Date(hb.updatedAt).getTime() < 60_000) {
        return NextResponse.json(
          {
            status: hb.connected ? "ready" : "online",
            health: {
              worker: "ok",
              whatsapp: {
                phase: hb.phase,
                connected: hb.connected,
                phone: hb.phone,
                pairingCode: hb.pairingCode,
                qrDataUrl: hb.qrDataUrl,
                error: hb.error,
                lastConnectedAt: hb.updatedAt,
              },
            },
          },
          { status: 200 },
        );
      }
    } catch {
      /* fallback */
    }
    return NextResponse.json({ error: "Worker is offline. Start the worker with 'npm run worker'." }, { status: 503 });
  }
}

