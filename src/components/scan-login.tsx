"use client";

import { useState } from "react";
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

function phaseLabel(phase: ScanSnapshot["phase"]) {
  switch (phase) {
    case "ready":
      return "Linked";
    case "qr":
      return "Scan the QR";
    case "connecting":
      return "Connecting";
    case "logged_out":
      return "Logged out";
    default:
      return "Not linked";
  }
}

export function ScanLogin() {
  const [scan, setScan] = useState<ScanSnapshot>({
    phase: "idle",
    qrDataUrl: null,
    phone: null,
    error: null,
  });
  const [busy, setBusy] = useState(false);
  const [pollId, setPollId] = useState<number | null>(null);

  function stopPolling() {
    if (pollId !== null) {
      window.clearInterval(pollId);
      setPollId(null);
    }
  }

  function startPolling() {
    stopPolling();
    const id = window.setInterval(() => {
      void fetch("/api/scan")
        .then((response) => response.json())
        .then((snapshot: ScanSnapshot) => {
          setScan(snapshot);
          if (snapshot.phase === "ready") {
            window.clearInterval(id);
            setPollId(null);
          }
        })
        .catch(() => {
          // Keep trying while WhatsApp is opening the QR.
        });
    }, 1500);
    setPollId(id);
  }

  async function showQr() {
    setBusy(true);
    try {
      const response = await fetch("/api/scan", { method: "POST" });
      const snapshot = (await response.json()) as ScanSnapshot;
      setScan(snapshot);
      startPolling();
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      stopPolling();
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
              Phone pe WhatsApp → Settings → Linked devices → Link a device,
              phir yeh QR scan. Server on rahe to Tarik ke naam se narm
              Hinglish replies chalte rehte hain. Facts tarikislam.in se.
            </CardDescription>
          </div>
          <Badge variant={scan.phase === "ready" ? "default" : "secondary"}>
            {phaseLabel(scan.phase)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-[280px_1fr]">
        <div className="flex items-center justify-center rounded-2xl border bg-white p-4">
          {scan.qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={scan.qrDataUrl}
              alt="WhatsApp link QR code"
              className="size-[240px]"
            />
          ) : scan.phase === "ready" ? (
            <p className="px-4 text-center text-sm font-medium text-primary">
              Linked{scan.phone ? ` as ${scan.phone}` : ""}. Incoming chats
              will get an auto-reply.
            </p>
          ) : (
            <p className="px-4 text-center text-sm text-muted-foreground">
              {scan.phase === "connecting"
                ? "Asking WhatsApp for a QR…"
                : "Click Show QR to start linking your phone."}
            </p>
          )}
        </div>
        <div className="space-y-3 text-sm leading-6">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Keep this page and the Relay server running while you are linked.</li>
            <li>On your phone, open WhatsApp → Linked devices → Link a device.</li>
            <li>Scan the QR. A new code appears if the first one expires.</li>
            <li>Send yourself a test text from another phone to confirm replies.</li>
          </ol>
          {scan.error ? <p className="text-destructive">{scan.error}</p> : null}
          <p className="text-xs text-muted-foreground">
            This uses WhatsApp Web linking, not Meta Cloud API. WhatsApp can
            drop unofficial sessions. It works on this always-on Node process
            (local preview or a VPS). Vercel serverless will not keep the scan
            session alive after the function sleeps.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={showQr} disabled={busy || scan.phase === "ready"}>
              {busy ? "Starting…" : scan.qrDataUrl ? "Refresh QR" : "Show QR"}
            </Button>
            <Button
              variant="outline"
              onClick={logout}
              disabled={busy || scan.phase === "idle"}
            >
              Log out
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
