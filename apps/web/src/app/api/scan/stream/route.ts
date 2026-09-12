import { loadWorkerHeartbeat } from "@bot/database";
import { getWorkerLive, resolveWorkerBase, workerLooksLocal } from "@/lib/worker-client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  return proxyStream(request);
}

export async function POST(request: Request) {
  return proxyStream(request);
}

async function proxyStream(request: Request) {
  const base = await resolveWorkerBase();
  const secret = process.env.WORKER_API_SECRET || "wp9_sec_9114411026_daziai_crm";
  const url = new URL(request.url);
  const pair = url.searchParams.get("pair");
  const target = `${base}/session/stream${pair ? `?pair=${encodeURIComponent(pair)}` : ""}`;
  let body: string | undefined;
  if (request.method === "POST") {
    body = await request.text();
  }
  try {
    const response = await fetch(target, {
      method: request.method,
      headers: {
        Authorization: `Bearer ${secret}`,
        "x-worker-secret": secret,
        "Content-Type": "application/json",
      },
      body: request.method === "POST" ? body || "{}" : undefined,
    });
    if (!response.ok || !response.body) {
      try {
        const hb = await loadWorkerHeartbeat();
        if (hb && Date.now() - new Date(hb.updatedAt).getTime() < 60_000) {
          return new Response(
            `data: ${JSON.stringify({
              snapshot: {
                phase: hb.connected ? "ready" : hb.phase || "idle",
                qrDataUrl: hb.qrDataUrl,
                phone: hb.phone,
                pairingCode: hb.pairingCode,
                persisted: Boolean(hb.connected || hb.phase === "ready"),
                error: hb.error,
              },
            })}\n\n`,
            {
              status: 200,
              headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
              },
            },
          );
        }
      } catch {
        /* fallback */
      }
      const detail = await response.text().catch(() => "");
      return new Response(
        `data: ${JSON.stringify({
          snapshot: {
            phase: "idle",
            qrDataUrl: null,
            phone: null,
            pairingCode: null,
            persisted: false,
            error:
              "WhatsApp worker is unavailable. Please verify the worker service is running and WORKER_API_URL is configured.",
            detail: detail.slice(0, 200),
          },
        })}\n\n`,
        {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
          },
        },
      );
    }
    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch {
    try {
      const hb = await loadWorkerHeartbeat();
      if (hb && Date.now() - new Date(hb.updatedAt).getTime() < 60_000) {
        return new Response(
          `data: ${JSON.stringify({
            snapshot: {
              phase: hb.connected ? "ready" : hb.phase || "idle",
              qrDataUrl: hb.qrDataUrl,
              phone: hb.phone,
              pairingCode: hb.pairingCode,
              persisted: Boolean(hb.connected || hb.phase === "ready"),
              error: hb.error,
            },
          })}\n\n`,
          {
            status: 200,
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
            },
          },
        );
      }
    } catch {
      /* fallback */
    }
    let isAlive = false;
    try {
      const live = await getWorkerLive(2500);
      isAlive = live.ok;
    } catch {
      /* ignore */
    }

    const local = workerLooksLocal();
    const onVercel = Boolean(process.env.VERCEL);
    const isProd = process.env.NODE_ENV === "production" || onVercel;

    const errorMsg = isAlive
      ? "Worker process is online. Initializing WhatsApp session..."
      : onVercel && local
        ? "Vercel cannot reach a localhost worker directly. Set WORKER_API_URL to your public tunnel or worker host URL."
        : isProd
          ? "Worker URL unreachable. Keep the worker process and tunnel/host online."
          : "Worker is offline. Run 'npm run worker' to start.";

    return new Response(
      `data: ${JSON.stringify({
        snapshot: {
          phase: isAlive ? "connecting" : "idle",
          qrDataUrl: null,
          phone: null,
          pairingCode: null,
          persisted: false,
          error: errorMsg,
        },
      })}\n\n`,
      {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
      },
    );
  }
}
