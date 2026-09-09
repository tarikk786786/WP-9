import { workerBase, workerLooksLocal } from "@/lib/worker-client";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  return proxyStream(request);
}

export async function POST(request: Request) {
  return proxyStream(request);
}

async function proxyStream(request: Request) {
  const secret = process.env.WORKER_API_SECRET || "dev-worker-secret-change-me";
  const url = new URL(request.url);
  const pair = url.searchParams.get("pair");
  const target = `${workerBase()}/session/stream${pair ? `?pair=${encodeURIComponent(pair)}` : ""}`;
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
              "WhatsApp worker band hai. Vercel pe QR nahi chalta — worker URL set karo (WORKER_API_URL).",
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
    const local = workerLooksLocal();
    const onVercel = Boolean(process.env.VERCEL);
    return new Response(
      `data: ${JSON.stringify({
        snapshot: {
          phase: "idle",
          qrDataUrl: null,
          phone: null,
          pairingCode: null,
          persisted: false,
          error: onVercel && local
            ? "Vercel is pointing WORKER_API_URL at localhost. Set a public https worker URL."
            : onVercel
              ? "Worker URL reach nahi ho raha. Worker process aur tunnel/host online rakho."
              : "Worker offline hai. npm run worker chalao.",
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
