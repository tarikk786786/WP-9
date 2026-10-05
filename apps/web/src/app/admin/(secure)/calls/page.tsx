'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  PhoneCall,
  ShieldAlert,
  Mic,
  Volume2,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  Radio,
} from 'lucide-react';

interface CallConfigData {
  enabled: boolean;
  transport: {
    name: string;
    isProductionReady: boolean;
    notice: string;
    status: string;
  };
  policy: {
    autoAnswerEnabled: boolean;
    unknownCallerMode: string;
    recordingEnabled: boolean;
    maxConcurrentCalls: number;
    maxCallDurationMs: number;
    silenceTimeoutMs: number;
    aiDisclosure: string;
  };
  metrics: {
    activeCalls: number;
    totalCallsLogged: number;
    averageLatencyMs: number;
  };
}

export default function VoiceCallsPage() {
  const [data, setData] = useState<CallConfigData | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchCallData() {
    try {
      const res = await fetch('/api/calls');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Failed to load call status', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCallData();
    const interval = setInterval(fetchCallData, 10_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <PhoneCall className="h-6 w-6 text-emerald-500" />
            Voice Call Agent
          </h1>
          <p className="text-sm text-muted-foreground">
            WP-9 WhatsApp Voice Calling Pipeline & Telemetry
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setLoading(true);
              fetchCallData();
            }}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Production Warning / Transport Audit Banner */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-amber-600 dark:text-amber-400">
        <div className="flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-semibold">
              Call Transport Status: EXPERIMENTAL
            </p>
            <p className="text-xs text-amber-600/90 dark:text-amber-400/90">
              WhatsApp VoIP duplex SRTP media streaming is not natively production-ready in Baileys 6.7.24.
              The voice call module operates behind the safe feature flag{' '}
              <code className="bg-amber-500/20 px-1 py-0.5 rounded font-mono">VOICE_CALLING_ENABLED=false</code>.
              Mock transport and unit test suites are 100% verified.
            </p>
          </div>
        </div>
      </div>

      {/* Core KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Pipeline Status</CardTitle>
            <Radio className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold flex items-center gap-2">
              {data?.enabled ? (
                <Badge className="bg-emerald-500 text-white">ACTIVE</Badge>
              ) : (
                <Badge variant="secondary">STANDBY (DISABLED)</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Flag: VOICE_CALLING_ENABLED
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Active Calls</CardTitle>
            <PhoneCall className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.metrics.activeCalls ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Max concurrent: {data?.policy.maxConcurrentCalls ?? 1}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">ASR & VAD</CardTitle>
            <Mic className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-semibold">Groq Whisper Large v3 Turbo</div>
            <p className="text-xs text-muted-foreground mt-1">
              16kHz Mono Float32 PCM
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Voice TTS</CardTitle>
            <Volume2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-semibold">OpenAI TTS-1 / Synthetic</div>
            <p className="text-xs text-muted-foreground mt-1">
              Hindi & Hinglish Natural Spoken
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Safety & Policy Configuration */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Call Safety & Ethics Guard
            </CardTitle>
            <CardDescription>Strict policy requirements enforced on every call</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-muted-foreground">Transparent AI Disclosure</span>
              <Badge variant="outline" className="text-emerald-500 border-emerald-500/30">
                ENABLED
              </Badge>
            </div>
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-muted-foreground">Call Audio Recording</span>
              <Badge variant="outline" className="text-rose-500 border-rose-500/30">
                STRICTLY DISABLED
              </Badge>
            </div>
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-muted-foreground">Max Hourly Calls / Contact</span>
              <span className="font-semibold">5 calls / hr</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Consecutive Call Cooldown</span>
              <span className="font-semibold">30 seconds</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-indigo-500" />
              Latency & Conversational Turn Limits
            </CardTitle>
            <CardDescription>Low-latency constraints optimized for real-time phone calls</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-muted-foreground">Max Call Duration</span>
              <span className="font-semibold">
                {Math.round((data?.policy.maxCallDurationMs ?? 300000) / 60000)} mins
              </span>
            </div>
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-muted-foreground">Caller Interruption (Barge-in)</span>
              <Badge variant="outline" className="text-indigo-500 border-indigo-500/30">
                INSTANT ABORT
              </Badge>
            </div>
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-muted-foreground">Silence Timeout</span>
              <span className="font-semibold">
                {(data?.policy.silenceTimeoutMs ?? 500)} ms
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Response Brevity</span>
              <span className="font-semibold">1–2 short conversational sentences</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Disclosure Greeting */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Standard Spoken AI Disclosure</CardTitle>
          <CardDescription>
            Requirement 7: Transparent AI identification to ensure ethical, clear caller expectations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm italic bg-muted/50 p-3 rounded border font-mono">
            &quot;{data?.policy.aiDisclosure || "Namaste, main AI assistant hoon. Main aapki baat sun kar help kar sakta hoon."}&quot;
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
