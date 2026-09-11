import { NextResponse } from "next/server";
import { workerFetch } from "@/lib/worker-client";
import { loadWorkerHeartbeat } from "@bot/database";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await workerFetch("/health");
    if (response.ok) {
      const body = await response.json();
      return NextResponse.json({ web: "ok", worker: body }, { status: 200 });
    }
  } catch {
    /* fallback to Supabase heartbeat */
  }

  try {
    const hb = await loadWorkerHeartbeat();
    if (hb && Date.now() - new Date(hb.updatedAt).getTime() < 60_000) {
      return NextResponse.json(
        {
          web: "ok",
          worker: {
            worker: "ok",
            status: hb.connected ? "healthy" : "degraded",
            supabase: true,
            whatsappConnection: hb.connected ? "CONNECTED" : hb.phase,
            whatsapp: {
              phase: hb.phase,
              connected: hb.connected,
              phone: hb.phone,
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

  const onVercel = Boolean(process.env.VERCEL);
  const isProd = process.env.NODE_ENV === "production" || onVercel;

  return NextResponse.json(
    {
      web: "ok",
      worker: {
        worker: "down",
        error: isProd
          ? "Baileys worker is not reachable on the configured host. Check Render service status."
          : "Baileys worker is not reachable. Run npm run worker.",
      },
    },
    { status: 200 },
  );
}
