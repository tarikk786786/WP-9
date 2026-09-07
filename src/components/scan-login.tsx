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

function emptyScan(): ScanSnapshot {
  return {
    phase: "idle",
    qrDataUrl: null,
    phone: null,
    error: null,
    persisted: false,
    savedAt: null,
    serverless: false,
  };
}

function phaseLabel(scan: ScanSnapshot) {
  if (scan.serverless) return "Vercel · QR off";
  switch (scan.phase) {
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
  const [scan, setScan] = useState<ScanSnapshot>(emptyScan);
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
          if (snapshot.qrDataUrl || snapshot.phase === "ready" || snapshot.phase === "logged_out" || snapshot.serverless) {
            window.clearInterval(id);
            setPollId(null);
          }
        })
        .catch(() => {
          // Keep trying while WhatsApp is opening the QR.
        });
    }, 1200);
    setPollId(id);
  }

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/scan")
      .then((response) => response.json())
      .then(async (snapshot: ScanSnapshot) => {
        if (cancelled) return;
        setScan(snapshot);
        if (snapshot.serverless) return;
        if (snapshot.persisted && snapshot.phase !== "ready") {
          const started = await fetch("/api/scan", { method: "POST" });
          const next = (await started.json()) as ScanSnapshot;
          if (!cancelled) {
            setScan(next);
            if (!next.serverless) startPolling();
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
      if (!snapshot.serverless && snapshot.phase !== "idle") {
        startPolling();
      }
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
              QR sirf us machine pe aata hai jahan <code>npm run live</code>{" "}
              chal raha ho. Vercel pe Show QR kaam nahi karta.
            </CardDescription>
          </div>
          <Badge variant={scan.phase === "ready" ? "default" : "secondary"}>
            {phaseLabel(scan)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-[280px_1fr]">
        <div className="flex items-center justify-center rounded-2xl border bg-white p-4 min-h-[240px]">
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
            </p>
          ) : (
            <p className="px-4 text-center text-sm text-muted-foreground">
              {scan.serverless
                ? "Yahan QR nahi banega. Local live desk kholo."
                : busy || scan.phase === "connecting"
                  ? "WhatsApp se QR maang raha hoon — 20 sec tak wait…"
                  : "Laptop pe npm run live, phir Show QR."}
            </p>
          )}
        </div>
        <div className="space-y-3 text-sm leading-6">
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Apne laptop pe project folder mein <code>npm run live</code> chalao.
            </li>
            <li>
              Browser mein <code>http://127.0.0.1:43217</code> kholo — yeh Vercel URL nahi.
            </li>
            <li>Show QR dabao. Code yahi box mein aayega.</li>
            <li>Phone: WhatsApp → Linked devices → Link a device → scan.</li>
          </ol>
          {scan.persisted ? (
            <p className="text-xs text-primary">
              Saved login on this disk{scan.savedAt ? ` · ${scan.savedAt}` : ""}.
            </p>
          ) : null}
          {scan.error ? <p className="text-destructive">{scan.error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button onClick={showQr} disabled={busy || scan.phase === "ready" || scan.serverless}>
              {busy ? "QR aa raha hai…" : scan.qrDataUrl ? "Refresh QR" : "Show QR"}
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
