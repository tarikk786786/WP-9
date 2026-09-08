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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { copyText, downloadJson } from "@/lib/browser-copy";
import type { ScanSnapshot } from "@/lib/types";

const STORAGE_KEY = "tarik.whatsapp.session.v1";

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
  if (scan.phase === "ready") return "Linked · saved";
  if (scan.qrDataUrl) return "Scan QR";
  if (scan.pairingCode) return "Enter code";
  if (scan.phase === "connecting") return "Connecting";
  if (scan.persisted) return "Saved login";
  if (scan.phase === "logged_out") return "Logged out";
  return "Not linked";
}

function readLocalArchive(): unknown | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function writeLocalArchive(archive: unknown) {
  const files = (archive as { files?: { ["creds.json"]?: string } } | null)?.files;
  if (!files?.["creds.json"]) return false;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(archive));
  return true;
}

function clearLocalArchive() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // private mode
  }
}

export function ScanLogin({
  hostedOnVercel = false,
  initial,
  onInbox,
}: {
  hostedOnVercel?: boolean;
  initial?: ScanSnapshot;
  onInbox?: (messages: import("@/lib/types").InboxMessage[]) => void;
}) {
  const [scan, setScan] = useState<ScanSnapshot>(() => initial ?? emptyScan(hostedOnVercel));
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [savedHere, setSavedHere] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const phaseRef = useRef(scan.phase);
  const booted = useRef(false);
  phaseRef.current = scan.phase;

  function stopLogin() {
    abortRef.current?.abort();
    abortRef.current = null;
  }

  async function pullAndSaveLogin() {
    try {
      const response = await fetch("/api/scan/session", { cache: "no-store" });
      if (!response.ok) return;
      const json = (await response.json()) as {
        archive?: unknown;
        snapshot?: ScanSnapshot;
      };
      if (json.snapshot) setScan(json.snapshot);
      if (writeLocalArchive(json.archive)) setSavedHere(true);
    } catch {
      // disk or /tmp may still hold it
    }
  }

  async function readStream(pair?: string, silent = false) {
    stopLogin();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(!silent);
    if (!silent) {
      setScan((current) => ({
        ...current,
        phase: "connecting",
        error: null,
        qrDataUrl: null,
        pairingCode: null,
      }));
    }

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
          const payload = JSON.parse(line.slice(6)) as {
            snapshot?: ScanSnapshot;
            inbox?: import("@/lib/types").InboxMessage[];
          } & Partial<ScanSnapshot>;
          const snapshot = (payload.snapshot ?? payload) as ScanSnapshot;
          if (snapshot.phase) setScan(snapshot);
          if (payload.inbox && onInbox) onInbox(payload.inbox);
          if (snapshot.qrDataUrl || snapshot.pairingCode || snapshot.phase === "ready") {
            setBusy(false);
          }
          if (snapshot.phase === "ready" && snapshot.persisted) {
            void pullAndSaveLogin();
          }
          if (snapshot.phase === "logged_out") {
            setBusy(false);
            clearLocalArchive();
            setSavedHere(false);
            stopLogin();
            return;
          }
        }
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setScan((current) => ({
        ...current,
        phase: current.persisted ? "connecting" : "idle",
        error: error instanceof Error ? error.message : "Login fail ho gaya.",
      }));
    } finally {
      setBusy(false);
      if (
        !controller.signal.aborted &&
        abortRef.current === controller &&
        (phaseRef.current === "ready" ||
          phaseRef.current === "qr" ||
          phaseRef.current === "connecting")
      ) {
        abortRef.current = null;
        window.setTimeout(() => {
          if (abortRef.current) return;
          void readStream(undefined, true);
        }, 800);
      }
    }
  }

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    if (typeof window !== "undefined") {
      setSavedHere(Boolean(readLocalArchive()));
    }

    void (async () => {
      try {
        const response = await fetch("/api/scan", { cache: "no-store" });
        const server = (await response.json()) as ScanSnapshot;
        if (server.phase === "ready" || server.persisted) {
          setScan(server);
          if (server.phone) setPhone(server.phone);
          void readStream(undefined, true);
          void pullAndSaveLogin();
          return;
        }

        const archive = readLocalArchive();
        if (!archive) return;
        const restore = await fetch("/api/scan/restore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(archive),
        });
        const snap = (await restore.json()) as ScanSnapshot & { error?: string };
        if (!restore.ok) {
          clearLocalArchive();
          setSavedHere(false);
          setScan((current) => ({
            ...current,
            error: snap.error ?? "Saved login restore nahi hua. Naya QR.",
          }));
          return;
        }
        setScan(snap);
        setSavedHere(true);
        if (snap.phone) setPhone(snap.phone);
        void readStream(undefined, true);
      } catch {
        // First visit — user can Show QR.
      }
    })();
    // Boot once on mount; readStream is stable enough for this desk.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function exportLogin() {
    setExportNote(null);
    try {
      const response = await fetch("/api/scan/session", { cache: "no-store" });
      const json = (await response.json()) as {
        archive?: { files?: { ["creds.json"]?: string } };
        snapshot?: ScanSnapshot;
      };
      if (json.snapshot) setScan(json.snapshot);
      if (!json.archive?.files?.["creds.json"]) {
        setExportNote("Pehle WhatsApp Linked karo, phir Export login.");
        return;
      }
      if (writeLocalArchive(json.archive)) setSavedHere(true);
      downloadJson("tarik-whatsapp-login.json", json.archive);
      const copied = await copyText(JSON.stringify(json.archive));
      setExportNote(
        copied
          ? "Login file download ho gayi, clipboard pe bhi. Vercel env: WHATSAPP_AUTH_JSON."
          : "Login file download ho gayi.",
      );
    } catch (error) {
      setExportNote(error instanceof Error ? error.message : "Export fail.");
    }
  }

  async function importLoginFile(file: File) {
    setExportNote(null);
    try {
      const archive = JSON.parse(await file.text()) as unknown;
      const restore = await fetch("/api/scan/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(archive),
      });
      const snap = (await restore.json()) as ScanSnapshot & { error?: string };
      if (!restore.ok) {
        setExportNote(snap.error ?? "Import fail. File check karo.");
        return;
      }
      if (writeLocalArchive(archive)) setSavedHere(true);
      setScan(snap);
      if (snap.phone) setPhone(snap.phone);
      setExportNote("Login import ho gayi. Reconnect chal raha hai.");
      void readStream(undefined, true);
    } catch {
      setExportNote("JSON file padhi nahi. Export wali file use karo.");
    }
  }

  async function logout() {
    stopLogin();
    setBusy(true);
    try {
      clearLocalArchive();
      setSavedHere(false);
      const response = await fetch("/api/scan", { method: "DELETE" });
      setScan((await response.json()) as ScanSnapshot);
    } finally {
      setBusy(false);
    }
  }

  const remembered = scan.persisted || savedHere;

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>WhatsApp login</CardTitle>
            <CardDescription>
              Ek baar QR / pairing. Login is device pe save hota hai — refresh
              ke baad wapas connect. Log out se hi bhoolta hai.
            </CardDescription>
          </div>
          <Badge variant={scan.phase === "ready" || remembered ? "default" : "secondary"}>
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
              Linked{scan.phone ? ` as ${scan.phone}` : ""}. Login saved
              {scan.savedAt ? ` · ${scan.savedAt.slice(0, 16).replace("T", " ")} UTC` : ""}.
            </p>
          ) : remembered ? (
            <p className="px-4 text-center text-sm font-medium">
              Saved login mil gaya{scan.phone ? ` (${scan.phone})` : ""}. Reconnect
              ho raha hai — naya QR nahi.
            </p>
          ) : (
            <p className="px-4 text-center text-sm text-muted-foreground">
              {busy || scan.phase === "connecting"
                ? "WhatsApp se login maang raha hoon…"
                : "QR ya pairing se login karo. Phir yeh save ho jayega."}
            </p>
          )}
        </div>
        <div className="space-y-3 text-sm leading-6">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Show QR — 20 second mein code box mein aana chahiye.</li>
            <li>Phone: Linked devices → Link a device → QR scan.</li>
            <li>Linked ke baad login disk + is browser mein save. Refresh allowed.</li>
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
          {exportNote ? <p className="text-xs">{exportNote}</p> : null}
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void importLoginFile(file);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => void readStream()}
              disabled={busy || scan.phase === "ready"}
            >
              {busy && !phone ? "QR aa raha hai…" : remembered ? "Reconnect" : "Show QR"}
            </Button>
            <Button
              variant="outline"
              onClick={() => void readStream(phone)}
              disabled={busy || scan.phase === "ready" || phone.replace(/\D/g, "").length < 10}
            >
              Link with code
            </Button>
            <Button variant="outline" onClick={() => void exportLogin()} disabled={busy}>
              Export login
            </Button>
            <Button
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              Import login
            </Button>
            <Button
              variant="ghost"
              onClick={() => void logout()}
              disabled={busy || (scan.phase === "idle" && !remembered)}
            >
              Log out
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
