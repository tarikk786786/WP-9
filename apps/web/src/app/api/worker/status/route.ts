import { NextResponse } from "next/server";
import { loadWorkerHeartbeat } from "@bot/database";
import { getWorkerDetails, workerFetch, workerLooksLocal } from "@/lib/worker-client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const details = await getWorkerDetails(4000);
    if (details.ok && details.data) {
      let analytics = null;
      let settings = null;
      try {
        const fullRes = await workerFetch("/status");
        if (fullRes.ok) {
          const fullJson = (await fullRes.json()) as { analytics?: unknown; settings?: unknown };
          analytics = fullJson.analytics;
          settings = fullJson.settings;
        }
      } catch {
        /* details is sufficient */
      }
      return NextResponse.json(
        {
          status: details.data.whatsapp.status === "CONNECTED" ? "ready" : "online",
          health: details.data,
          analytics,
          settings,
        },
        {
          status: 200,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
          },
        },
      );
    }
  } catch {
    /* fallback to heartbeat */
  }

  try {
    const hb = await loadWorkerHeartbeat();
    if (hb && Date.now() - new Date(hb.updatedAt).getTime() < 60_000) {
      return NextResponse.json(
        {
          status: hb.connected ? "ready" : "online",
          health: {
            service: "wp9-worker",
            process: { status: "running" },
            http: { status: "degraded" },
            whatsapp: {
              phase: hb.phase,
              status: hb.connected ? "CONNECTED" : hb.phase,
              connected: hb.connected,
              phone: hb.phone,
              pairingCode: hb.pairingCode,
              qrDataUrl: hb.qrDataUrl,
              error: hb.error,
              lastConnectedAt: hb.updatedAt,
            },
            heartbeat: { lastHeartbeatAt: hb.updatedAt },
          },
        },
        {
          status: 200,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
          },
        },
      );
    }
  } catch {
    /* fallback */
  }

  const onVercel = Boolean(process.env.VERCEL);
  const isProd = process.env.NODE_ENV === "production" || onVercel;
  const localUrl = workerLooksLocal();

  const errorMessage = onVercel && localUrl
    ? "Vercel cannot reach a localhost worker directly. Set WORKER_API_URL to your public tunnel or worker host URL."
    : isProd
      ? "Worker service is unreachable. Ensure the worker host or tunnel is running and WORKER_API_URL is configured."
      : "Worker is offline. Run 'npm run worker' to start.";

  return NextResponse.json(
    {
      error: errorMessage,
      code: "WORKER_UNREACHABLE",
    },
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    },
  );
}


