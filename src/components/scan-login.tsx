"use client";

import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    pairingCode: null,
  };
}

function phaseLabel(scan: ScanSnapshot) {
  if (scan.phase === "ready") return "Linked";
  if (scan.qrDataUrl) return "Scan QR";
  if (scan.pairingCode) return "Enter code";
  if (scan.phase === "connecting") return "Connecting";
  if (scan.phase === "logged_out") return "Logged out";
  return "Not linked";
}

export function ScanLogin({ hostedOnVercel = false }: { hostedOnVercel?: boolean }) {
  const [scan, setScan] = useState<ScanSnapshot>(() => emptyScan(hostedOnVercel));
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  function stopLogin() {
    abortRef.current?.abort();
    abortRef.current = null;
  }

  async function readStream(pair?: string) {
    stopLogin();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setScan((current) => ({
      ...current,
      phase: "connecting",
      error: null,
      qrDataUrl: null,
      pairingCode: null,
    }));

    try {
      const response = await fetch("/api/scan/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pair ? { pair } : {}),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        throw new Error("Login start nahi hua. Dubara try karo.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (!controller.signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const line = chunk
            .split("\n")
            .find((item) => item.startsWith("data: "));
          if (!line) continue;
          const snapshot = JSON.parse(line.slice(6)) as ScanSnapshot;
          setScan(snapshot);
          if (snapshot.qrDataUrl || snapshot.pairingCode) {
            setBusy(false);
          }
          if (snapshot.phase === "ready" || snapshot.phase === "logged_out") {
            setBusy(false);
            stopLogin();
            return;
          }
        }
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setScan((current) => ({
        ...current,
        phase: "idle",
        error: error instanceof Error ? error.message : "Login fail ho gaya.",
      }));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    stopLogin();
    setBusy(true);
    try {
      const response = await fetch("/api/scan", { method: "DELETE" });
      setScan((await response.json()) as ScanSnapshot);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>WhatsApp login</CardTitle>
            <CardDescription>
              QR scan karo, ya number daal ke pairing code lo. Tab tab tak khula
              rakho jab tak Linked na ho.
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
              alt="WhatsApp QR"
              className="size-[240px]"
            />
          ) : scan.pairingCode ? (
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Phone pe yeh code daalo</p>
              <p className="mt-2 font-heading text-3xl tracking-[0.25em]">
                {scan.pairingCode}
              </p>
            </div>
          ) : scan.phase === "ready" ? (
            <p className="px-4 text-center text-sm font-medium text-primary">
              Linked{scan.phone ? ` as ${scan.phone}` : ""}.
            </p>
          ) : (
            <p className="px-4 text-center text-sm text-muted-foreground">
              {busy || scan.phase === "connecting"
                ? "WhatsApp se login maang raha hoon…"
                : "QR ya pairing se login karo."}
            </p>
          )}
        </div>
        <div className="space-y-3 text-sm leading-6">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Show QR — 20 second mein code box mein aana chahiye.</li>
            <li>Phone: Linked devices → Link a device → QR scan.</li>
            <li>QR na aaye to neeche number (country code ke sath) daal ke pairing lo.</li>
          </ol>
          <div className="space-y-2">
            <Label htmlFor="wa-phone">Phone with country code</Label>
            <Input
              id="wa-phone"
              inputMode="tel"
              placeholder="9198XXXXXXXX"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </div>
          {scan.error ? <p className="text-destructive">{scan.error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void readStream()} disabled={busy || scan.phase === "ready"}>
              {busy && !phone ? "QR aa raha hai…" : "Show QR"}
            </Button>
            <Button
              variant="outline"
              onClick={() => void readStream(phone)}
              disabled={busy || scan.phase === "ready" || phone.replace(/\D/g, "").length < 10}
            >
              Link with code
            </Button>
            <Button
              variant="ghost"
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
