"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type SystemHealthState = {
  status: string;
  error?: string;
  code?: string;
  health?: {
    service?: string;
    uptimeSeconds?: number;
    pid?: number;
    process?: {
      status?: string;
      memoryUsageMb?: number;
    };
    http?: {
      status?: string;
      port?: number;
      host?: string;
    };
    whatsapp?: {
      status?: string;
      phase?: string;
      connected?: boolean;
      phone?: string | null;
      reconnectAttempts?: number;
      lastConnectedAt?: string | null;
    };
    database?: {
      status?: string;
      latencyMs?: number | null;
    };
    auth?: {
      status?: string;
      source?: string;
    };
    queue?: {
      status?: string;
      pending?: number;
      processing?: number;
      failed?: number;
    };
    heartbeat?: {
      lastHeartbeatAt?: string | null;
    };
    conversationEngine?: {
      metrics?: {
        messages_received?: number;
        duplicate_messages?: number;
        logical_turns?: number;
        responses_generated?: number;
        responses_committed?: number;
        responses_sent?: number;
        responses_suppressed?: number;
        duplicate_response_attempts?: number;
        multiple_response_rate?: number;
      };
      outbox?: {
        pending?: number;
        sending?: number;
        sent?: number;
        failed?: number;
        deadLetter?: number;
      };
    };
  };
};

function formatUptime(seconds?: number) {
  if (!seconds || seconds <= 0) return "0s";
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

export function SystemStatus() {
  const [data, setData] = useState<SystemHealthState | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  async function fetchStatus() {
    setLoading(true);
    try {
      const res = await fetch("/api/worker/status", { cache: "no-store" });
      const json = (await res.json()) as SystemHealthState;
      setData(json);
      setLastRefreshed(new Date());
    } catch {
      setData({
        status: "unreachable",
        error: "Cannot connect to worker status API.",
        code: "WORKER_UNREACHABLE",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchStatus();
    const interval = setInterval(() => {
      void fetchStatus();
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  async function handleRetryOutbox() {
    setActionNotice("Retrying dead letters...");
    try {
      const res = await fetch("/api/admin/outbox/retry", { method: "POST" });
      if (res.ok) {
        setActionNotice("Dead letters queued for re-delivery.");
      } else {
        setActionNotice("Retry command failed.");
      }
    } catch {
      setActionNotice("Failed to reach worker.");
    }
    setTimeout(() => setActionNotice(null), 3000);
    void fetchStatus();
  }

  async function handleResetCircuit() {
    setActionNotice("Resetting circuit breakers...");
    try {
      const res = await fetch("/api/admin/circuit/reset", { method: "POST" });
      if (res.ok) {
        setActionNotice("Circuit breakers reset to CLOSED.");
      } else {
        setActionNotice("Reset command failed.");
      }
    } catch {
      setActionNotice("Failed to reach worker.");
    }
    setTimeout(() => setActionNotice(null), 3000);
    void fetchStatus();
  }

  const h = data?.health;
  const isAlive = Boolean(
    data?.status === "ready" ||
    data?.status === "online" ||
    h?.process?.status === "running" ||
    h?.uptimeSeconds
  );
  const isConnected = Boolean(h?.whatsapp?.connected || h?.whatsapp?.status === "CONNECTED");
  const waPhase = h?.whatsapp?.status || h?.whatsapp?.phase || (isConnected ? "CONNECTED" : "UNKNOWN");
  const dbStatus = h?.database?.status || "healthy";
  const queuePending = h?.queue?.pending ?? 0;
  const queueFailed = h?.queue?.failed ?? 0;

  return (
    <Card className="w-full border-border/60 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base font-semibold">System Operational Health</CardTitle>
            <CardDescription className="text-xs">
              Live multi-dimensional telemetry across process, socket, database, and message queue.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={isConnected ? "default" : isAlive ? "secondary" : "destructive"}>
              {isConnected ? "Fully Live" : isAlive ? "Worker Running (WhatsApp Disconnected)" : "Worker Offline"}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => void fetchStatus()}
              disabled={loading}
            >
              {loading ? "..." : "Refresh"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-1">
        {data?.error && !isAlive && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            <p className="font-semibold">{data.error}</p>
            {data.code && <p className="mt-0.5 opacity-80">Error Code: {data.code}</p>}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
          {/* 1. Worker Process */}
          <div className="rounded-lg border bg-card p-2.5">
            <p className="text-[10px] font-medium tracking-wider uppercase text-muted-foreground">Process</p>
            <div className="mt-1 flex items-center gap-1.5">
              <span className={`size-2 rounded-full ${isAlive ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
              <span className="text-xs font-semibold">{isAlive ? "Running" : "Stopped"}</span>
            </div>
            {isAlive && h?.uptimeSeconds && (
              <p className="mt-1 text-[11px] text-muted-foreground">Up {formatUptime(h.uptimeSeconds)}</p>
            )}
          </div>

          {/* 2. HTTP Gateway */}
          <div className="rounded-lg border bg-card p-2.5">
            <p className="text-[10px] font-medium tracking-wider uppercase text-muted-foreground">HTTP API</p>
            <div className="mt-1 flex items-center gap-1.5">
              <span className={`size-2 rounded-full ${isAlive ? "bg-emerald-500" : "bg-rose-500"}`} />
              <span className="text-xs font-semibold">{isAlive ? "Healthy" : "Unreachable"}</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {h?.http?.port ? `Port ${h.http.port}` : "—"}
            </p>
          </div>

          {/* 3. WhatsApp Socket */}
          <div className="rounded-lg border bg-card p-2.5">
            <p className="text-[10px] font-medium tracking-wider uppercase text-muted-foreground">WhatsApp Web</p>
            <div className="mt-1 flex items-center gap-1.5">
              <span
                className={`size-2 rounded-full ${
                  isConnected ? "bg-emerald-500" : waPhase.includes("QR") ? "bg-amber-500 animate-pulse" : "bg-rose-500"
                }`}
              />
              <span className="text-xs font-semibold truncate">
                {isConnected ? "Linked" : waPhase.includes("QR") ? "Scan QR" : waPhase}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground truncate">
              {h?.whatsapp?.phone ? `+${h.whatsapp.phone}` : "Awaiting scan"}
            </p>
          </div>

          {/* 4. Database & Auth */}
          <div className="rounded-lg border bg-card p-2.5">
            <p className="text-[10px] font-medium tracking-wider uppercase text-muted-foreground">Database</p>
            <div className="mt-1 flex items-center gap-1.5">
              <span className={`size-2 rounded-full ${dbStatus === "healthy" ? "bg-emerald-500" : "bg-amber-500"}`} />
              <span className="text-xs font-semibold capitalize">{dbStatus}</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground capitalize">
              {h?.auth?.source === "supabase" ? "Supabase Cloud" : "Local Disk Fallback"}
            </p>
          </div>

          {/* 5. Message Outbox Queue */}
          <div className="rounded-lg border bg-card p-2.5">
            <p className="text-[10px] font-medium tracking-wider uppercase text-muted-foreground">Outbox Queue</p>
            <div className="mt-1 flex items-center gap-1.5">
              <span className={`size-2 rounded-full ${queueFailed > 0 ? "bg-amber-500" : "bg-emerald-500"}`} />
              <span className="text-xs font-semibold">{queueFailed > 0 ? "Degraded" : "Clear"}</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {queuePending} pend · {queueFailed} fail
            </p>
          </div>

          {/* 6. Conversation Brain Integrity */}
          <div className="rounded-lg border bg-card p-2.5">
            <p className="text-[10px] font-medium tracking-wider uppercase text-muted-foreground">Conv Brain</p>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-500" />
              <span className="text-xs font-semibold">
                {h?.conversationEngine?.metrics?.multiple_response_rate === 0 ? "0% Dup" : "Authoritative"}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground truncate">
              {h?.conversationEngine?.metrics?.logical_turns ?? 0} turns · {h?.conversationEngine?.metrics?.duplicate_messages ?? 0} dedup
            </p>
          </div>

          {/* 7. Heartbeat */}
          <div className="rounded-lg border bg-card p-2.5">
            <p className="text-[10px] font-medium tracking-wider uppercase text-muted-foreground">Heartbeat</p>
            <div className="mt-1 flex items-center gap-1.5">
              <span className={`size-2 rounded-full ${isAlive ? "bg-emerald-500" : "bg-zinc-400"}`} />
              <span className="text-xs font-semibold">{isAlive ? "Active" : "No Signal"}</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </p>
          </div>
        </div>

        {actionNotice && (
          <p className="text-xs font-medium text-primary animate-in fade-in">{actionNotice}</p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <span className="text-[11px] text-muted-foreground">
            Authoritative state: Vercel frontend proxies commands to the persistent worker host.
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => void handleResetCircuit()}
              disabled={!isAlive}
            >
              Reset Circuit
            </Button>
            {queueFailed > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => void handleRetryOutbox()}
              >
                Retry Failed Messages
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
