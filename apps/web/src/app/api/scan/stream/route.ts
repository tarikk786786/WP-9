import { workerBase } from "@/lib/worker-client";

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
  const response = await fetch(target, {
    method: request.method,
    headers: {
      Authorization: `Bearer ${secret}`,
      "x-worker-secret": secret,
      "Content-Type": "application/json",
    },
    body: request.method === "POST" ? body || "{}" : undefined,
  });
  return new Response(response.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
