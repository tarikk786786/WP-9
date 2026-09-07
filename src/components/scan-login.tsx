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
import type { ScanSnapshot } from "@/lib/types";

function phaseLabel(phase: ScanSnapshot["phase"]) {
  switch (phase) {
    case "ready":
      return "Linked · saved";
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
    persisted: false,
    savedAt: null,
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
          if (snapshot.phase === "ready" || snapshot.phase === "logged_out") {
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

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/scan")
      .then((response) => response.json())
      .then(async (snapshot: ScanSnapshot) => {
        if (cancelled) return;
        setScan(snapshot);
        if (snapshot.persisted && snapshot.phase !== "ready") {
          const started = await fetch("/api/scan", { method: "POST" });
          const next = (await started.json()) as ScanSnapshot;
          if (!cancelled) {
            setScan(next);
            startPolling();
          }
          return;
        }
        if (snapshot.phase === "qr" || snapshot.phase === "connecting") {
          startPolling();
        }
      })
      .catch(() => {
        // Desk still works if WhatsApp is offline.
      });
    return () => {
      cancelled = true;
    };
    // Mount-only restore of a saved login.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
              Ek baar QR scan. Login is machine pe forever save hota hai —
              restart ke baad bhi naya QR nahi. Main khud reply karta hoon,
              kisi ke behalf pe nahi. Facts tarikislam.in se.
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
              Linked{scan.phone ? ` as ${scan.phone}` : ""}. Login saved.
              Incoming chats pe main khud reply karta hoon.
            </p>
          ) : (
            <p className="px-4 text-center text-sm text-muted-foreground">
              {scan.phase === "connecting"
                ? scan.persisted
                  ? "Saved login se WhatsApp reconnect ho raha hai…"
                  : "Asking WhatsApp for a QR…"
                : "Click Show QR to start linking your phone."}
            </p>
          )}
        </div>
        <div className="space-y-3 text-sm leading-6">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Is machine pe <code>npm run live</code> hamesha on rakho — yahi always-live hai.</li>
            <li>Phone: WhatsApp → Linked devices → Link a device → QR scan.</li>
            <li>Scan ke baad creds <code>data/whatsapp-session.json</code> mein save ho jaate hain.</li>
            <li>Server restart ho to saved login se khud reconnect. Log out tabhi jab tum chaho.</li>
          </ol>
          {scan.persisted ? (
            <p className="text-xs text-primary">
              Saved login on this disk{scan.savedAt ? ` · ${scan.savedAt}` : ""}.
              WhatsApp ne logout kiya ho tabhi naya QR chahiye.
            </p>
          ) : null}
          {scan.error ? <p className="text-destructive">{scan.error}</p> : null}
          <p className="text-xs text-muted-foreground">
            Personal WhatsApp Web link. Vercel serverless so jaata hai, isliye
            24/7 ke liye yahi Node process (laptop ya VPS) chalao. Session files
            git mein mat daalo.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={showQr} disabled={busy || scan.phase === "ready"}>
              {busy ? "Starting…" : scan.qrDataUrl ? "Refresh QR" : "Show QR"}
            </Button>
            <Button
              variant="outline"
              onClick={logout}
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
