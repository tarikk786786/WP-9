"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ScanSnapshot } from "@/lib/types";

function emptyScan(serverless = false): ScanSnapshot {
  return {
    phase: "idle",
    qrDataUrl: null,
    phone: null,
    error: null,
    persisted: false,
    savedAt: null,
    serverless,
  };
}

function phaseLabel(scan: ScanSnapshot) {
  switch (scan.phase) {
    case "ready":
      return "Linked";
    case "qr":
      return "Scan the QR";
    case "connecting":
      return "Connecting";
    case "logged_out":
      return "Logged out";
    default:
      return scan.serverless ? "Ready to show QR" : "Not linked";
  }
}

export function ScanLogin({ hostedOnVercel = false }: { hostedOnVercel?: boolean }) {
  const [scan, setScan] = useState<ScanSnapshot>(() => emptyScan(hostedOnVercel));
  const [busy, setBusy] = useState(false);
  const streamRef = useRef<EventSource | null>(null);

  function stopStream() {
    streamRef.current?.close();
    streamRef.current = null;
  }

  function startStream() {
    stopStream();
    setBusy(true);
    const source = new EventSource("/api/scan/stream");
    streamRef.current = source;
    source.onmessage = (event) => {
      try {
        const snapshot = JSON.parse(event.data) as ScanSnapshot;
        setScan(snapshot);
        if (snapshot.qrDataUrl || snapshot.phase === "ready") {
          setBusy(false);
        }
        if (snapshot.phase === "ready" || snapshot.phase === "logged_out") {
          stopStream();
          setBusy(false);
        }
      } catch {
        // ignore a bad frame
      }
    };
    source.onerror = () => {
      setBusy(false);
    };
  }

  useEffect(() => {
    return () => stopStream();
  }, []);

  async function logout() {
    setBusy(true);
    try {
      stopStream();
      const response = await fetch("/api/scan", { method: "DELETE" });
      const snapshot = (await response.json()) as ScanSnapshot;
      setScan(snapshot);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Tarik ka WhatsApp link</CardTitle>
            <CardDescription>
              Show QR dabao. Code is box mein aayega. Tab band mat karna jab tak
              scan ho jaye.
            </CardDescription>
          </div>
          <Badge variant={scan.phase === "ready" ? "default" : "secondary"}>
            {phaseLabel(scan)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-[280px_1fr]">
        <div className="flex min-h-[240px] items-center justify-center rounded-2xl border bg-white p-4">
          {scan.qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={scan.qrDataUrl}
              alt="WhatsApp link QR code"
              className="size-[240px]"
            />
          ) : scan.phase === "ready" ? (
            <p className="px-4 text-center text-sm font-medium text-primary">
              Linked{scan.phone ? ` as ${scan.phone}` : ""}.
            </p>
          ) : (
            <p className="px-4 text-center text-sm text-muted-foreground">
              {busy || scan.phase === "connecting"
                ? "WhatsApp se QR aa raha hai…"
                : "Show QR dabao."}
            </p>
          )}
        </div>
        <div className="space-y-3 text-sm leading-6">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Show QR. 15–25 second wait — code yahi dikhega.</li>
            <li>Phone: WhatsApp → Linked devices → Link a device → scan.</li>
            <li>Yeh tab khula rakho jab tak Linked na ho.</li>
          </ol>
          {scan.error ? <p className="text-destructive">{scan.error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button onClick={startStream} disabled={busy || scan.phase === "ready"}>
              {busy ? "QR aa raha hai…" : scan.qrDataUrl ? "Refresh QR" : "Show QR"}
            </Button>
            <Button
              variant="outline"
              onClick={() => void logout()}
              disabled={busy || (scan.phase === "idle" && !scan.persisted)}
            >
              Log out
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
