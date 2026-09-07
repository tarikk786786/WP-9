import { getScanSnapshot, startScanSession } from "@/lib/scan-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

async function streamLogin(pairingPhone?: string) {
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      try {
        send(getScanSnapshot());
        void startScanSession(pairingPhone);
        const deadline = Date.now() + 240_000;
        while (!closed && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 600));
          const snapshot = getScanSnapshot();
          send(snapshot);
          if (snapshot.phase === "ready" || snapshot.phase === "logged_out") {
            break;
          }
        }
      } catch (error) {
        send({
          phase: "idle",
          qrDataUrl: null,
          pairingCode: null,
          phone: null,
          persisted: false,
          savedAt: null,
          serverless: true,
          error: error instanceof Error ? error.message : "Login stream failed.",
        });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function GET(request: Request) {
  const pair = new URL(request.url).searchParams.get("pair") ?? undefined;
  return streamLogin(pair);
}

export async function POST(request: Request) {
  let pair: string | undefined;
  try {
    const body = (await request.json()) as { pair?: string };
    pair = body.pair;
  } catch {
    pair = undefined;
  }
  return streamLogin(pair);
}
