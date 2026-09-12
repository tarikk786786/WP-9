'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Activity,
  ShieldCheck,
  Cpu,
  Database,
  RefreshCw,
  Server,
  Layers,
  Radio,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from 'lucide-react';

interface DiagnosticData {
  ok: boolean;
  timestamp: string;
  health: {
    overall: 'HEALTHY' | 'DEGRADED' | 'NOT_READY' | 'FAILED';
    layers: Record<string, { status: string; details?: Record<string, unknown> }>;
  };
  worker: {
    alive: boolean;
    whatsappConnected: boolean;
    phone: string | null;
    uptimeSeconds: number | null;
    memoryUsageMb: number | null;
  };
  reconciliation: {
    anomalies: Array<{ anomalyType: string; severity: string; description: string }>;
    repairedCount: number;
  };
  invariants: Array<{ code: string; name: string; status: string }>;
}

export default function DiagnosticsPage() {
  const [data, setData] = useState<DiagnosticData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  async function fetchDiagnostics() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/diagnostics');
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setLastRefreshed(new Date());
      }
    } catch (err) {
      console.error('Failed to load diagnostics', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDiagnostics();
    const interval = setInterval(fetchDiagnostics, 15000);
    return () => clearInterval(interval);
  }, []);

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'HEALTHY':
        return (
          <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Healthy
          </Badge>
        );
      case 'DEGRADED':
        return (
          <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> Degraded
          </Badge>
        );
      default:
        return (
          <Badge className="bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30 flex items-center gap-1">
            <XCircle className="w-3.5 h-3.5" /> {status || 'Unknown'}
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Diagnostics & System Invariants</h1>
          <p className="text-sm text-muted-foreground">
            L0–L9 layered health verification, zero-silent-failure invariants, and state reconciler.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Updated {lastRefreshed.toLocaleTimeString()}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={fetchDiagnostics}
            disabled={loading}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Top Banner Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">System Health</CardTitle>
            <Activity className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="flex items-center gap-2">
              {getStatusBadge(data?.health?.overall)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">WhatsApp Transport</CardTitle>
            <Radio className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-sm font-semibold">
              {data?.worker?.whatsappConnected ? (
                <span className="text-emerald-600 dark:text-emerald-400">Connected ({data.worker.phone || 'Active'})</span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400">Disconnected</span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Worker Host</CardTitle>
            <Server className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-sm font-semibold">
              {data?.worker?.alive ? (
                <span>
                  Online {data.worker.memoryUsageMb ? `(${data.worker.memoryUsageMb} MB)` : ''}
                </span>
              ) : (
                <span className="text-rose-600">Unreachable</span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Reconciliation Status</CardTitle>
            <ShieldCheck className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-sm font-semibold">
              {(data?.reconciliation?.anomalies?.length ?? 0) === 0 ? (
                <span className="text-emerald-600 dark:text-emerald-400">0 Anomalies</span>
              ) : (
                <span className="text-rose-600">{data?.reconciliation.anomalies.length} Flagged</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Layered Health Breakdown L0 - L9 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" />
            Layered Health Evaluation (L0 – L9)
          </CardTitle>
          <CardDescription>
            Multi-stage readiness checks verifying transport, database, models, media, and queues.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {data?.health?.layers &&
              Object.entries(data.health.layers).map(([layer, info]) => {
                const label = layer.replace(/_/g, ' ').toUpperCase();
                return (
                  <div key={layer} className="p-3 border rounded-lg bg-card/50 flex flex-col justify-between gap-2">
                    <span className="text-xs font-mono font-medium text-muted-foreground truncate">{label}</span>
                    <div className="flex items-center justify-between">
                      {getStatusBadge(info.status)}
                    </div>
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>

      {/* Turn Inspector Lifecycle Pipeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Cpu className="w-4 h-4 text-primary" />
            Authoritative Turn Pipeline Architecture
          </CardTitle>
          <CardDescription>
            Strict one-way execution flow ensuring one response per turn and zero silent drop.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 text-center text-xs">
            <div className="p-2.5 bg-muted/40 rounded border flex flex-col items-center justify-center gap-1">
              <span className="font-semibold text-foreground">1. Ingest</span>
              <span className="text-[10px] text-muted-foreground">Canonical ID</span>
            </div>
            <div className="p-2.5 bg-muted/40 rounded border flex flex-col items-center justify-center gap-1">
              <span className="font-semibold text-foreground">2. Security</span>
              <span className="text-[10px] text-muted-foreground">PII / Injection</span>
            </div>
            <div className="p-2.5 bg-muted/40 rounded border flex flex-col items-center justify-center gap-1">
              <span className="font-semibold text-foreground">3. Memory</span>
              <span className="text-[10px] text-muted-foreground">Temporal Graph</span>
            </div>
            <div className="p-2.5 bg-muted/40 rounded border flex flex-col items-center justify-center gap-1">
              <span className="font-semibold text-foreground">4. Tools / DB</span>
              <span className="text-[10px] text-muted-foreground">Truth Hierarchy</span>
            </div>
            <div className="p-2.5 bg-muted/40 rounded border flex flex-col items-center justify-center gap-1">
              <span className="font-semibold text-foreground">5. Models</span>
              <span className="text-[10px] text-muted-foreground">Groq / Failover</span>
            </div>
            <div className="p-2.5 bg-muted/40 rounded border flex flex-col items-center justify-center gap-1">
              <span className="font-semibold text-foreground">6. Verifier</span>
              <span className="text-[10px] text-muted-foreground">Grounding Check</span>
            </div>
            <div className="p-2.5 bg-muted/40 rounded border flex flex-col items-center justify-center gap-1">
              <span className="font-semibold text-foreground">7. Timing</span>
              <span className="text-[10px] text-muted-foreground">Presence & Hold</span>
            </div>
            <div className="p-2.5 bg-muted/40 rounded border flex flex-col items-center justify-center gap-1">
              <span className="font-semibold text-foreground">8. Outbox</span>
              <span className="text-[10px] text-muted-foreground">Single Delivery</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Formal System Invariants */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            Formal System Invariants Matrix
          </CardTitle>
          <CardDescription>
            Core rules enforced across bot-engine, database transactions, and network dispatch.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y border rounded-lg overflow-hidden">
            {data?.invariants?.map((inv) => (
              <div key={inv.code} className="p-3 flex items-center justify-between text-xs hover:bg-muted/20">
                <div className="space-y-0.5">
                  <span className="font-mono font-semibold text-foreground mr-2">{inv.code}:</span>
                  <span className="text-muted-foreground">{inv.name}</span>
                </div>
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">
                  Enforced
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
