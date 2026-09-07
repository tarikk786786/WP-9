import { getScanSnapshot, startScanSession } from "@/lib/scan-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
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
        send(await startScanSession());
        const deadline = Date.now() + 240_000;
        while (!closed && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 800));
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
          phone: null,
          persisted: false,
          savedAt: null,
          serverless: true,
          error: error instanceof Error ? error.message : "QR stream failed.",
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
