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
const MARK_KEY = "tarik.whatsapp.linked.v1";

function emptyScan(): ScanSnapshot {
  return {
    phase: "idle",
    qrDataUrl: null,
    phone: null,
    error: null,
    persisted: false,
    savedAt: null,
    serverless: false,
    pairingCode: null,
  };
}

function normalizeScan(raw: Partial<ScanSnapshot> & { connected?: boolean; lastConnectedAt?: string | null }): ScanSnapshot {
  const connected = Boolean(raw.connected || raw.phase === "ready");
  return {
    phase: connected ? "ready" : (raw.phase ?? "idle"),
    qrDataUrl: raw.qrDataUrl ?? null,
    phone: raw.phone ?? null,
    error: raw.error ?? null,
    persisted: Boolean(raw.persisted || connected),
    savedAt: raw.savedAt ?? raw.lastConnectedAt ?? null,
    serverless: Boolean(raw.serverless),
    pairingCode: raw.pairingCode ?? null,
  };
}

function phaseLabel(scan: ScanSnapshot) {
  if (scan.phase === "ready" || (scan.persisted && scan.phase !== "logged_out" && scan.phase !== "qr")) {
    return "Linked · saved";
  }
  if (scan.qrDataUrl) return "Scan QR";
  if (scan.pairingCode) return "Enter code";
  if (scan.phase === "connecting") return "Connecting";
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

function rememberLinked(scan: ScanSnapshot) {
  if (scan.phase !== "ready" || !scan.phone) return;
  try {
    localStorage.setItem(MARK_KEY, JSON.stringify({ phone: scan.phone, savedAt: scan.savedAt, persisted: true }));
  } catch {
    /* private mode */
  }
}

function readLinkedMark(): { phone?: string; savedAt?: string | null } | null {
  try {
    const raw = localStorage.getItem(MARK_KEY);
    return raw ? (JSON.parse(raw) as { phone?: string; savedAt?: string | null }) : null;
  } catch {
    return null;
  }
}

function clearLocalArchive() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(MARK_KEY);
  } catch {
    /* private mode */
  }
}

export function ScanLogin({
  initial,
  onInbox,
}: {
  hostedOnVercel?: boolean;
  initial?: ScanSnapshot;
  onInbox?: (messages: import("@/lib/types").InboxMessage[]) => void;
}) {
  const [scan, setScan] = useState<ScanSnapshot>(() => initial ?? emptyScan());
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [savedHere, setSavedHere] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const scanRef = useRef(scan);
  scanRef.current = scan;

  function applyScan(raw: Partial<ScanSnapshot> & { connected?: boolean; lastConnectedAt?: string | null }, fromStream = false) {
    const next = normalizeScan(raw);
    setScan((current) => {
      if (fromStream && (current.phase === "ready" || current.persisted) && next.phase === "idle") {
        return current;
      }
      return next;
    });
    if (next.phone) setPhone(next.phone);
    if (next.phase === "ready") {
      rememberLinked(next);
      setSavedHere(true);
    }
  }

  function stopLogin() {
    abortRef.current?.abort();
    abortRef.current = null;
  }

  async function pullStatus() {
    const response = await fetch("/api/scan", { cache: "no-store" });
    const json = (await response.json()) as Partial<ScanSnapshot> & { connected?: boolean; lastConnectedAt?: string | null };
    applyScan(json);
    return normalizeScan(json);
  }

  async function pullAndSaveLogin() {
    try {
      const response = await fetch("/api/scan/session", { cache: "no-store" });
      if (!response.ok) return;
      const json = (await response.json()) as {
        archive?: unknown;
        snapshot?: ScanSnapshot;
      };
      if (json.snapshot) applyScan(json.snapshot);
      if (writeLocalArchive(json.archive)) setSavedHere(true);
    } catch {
      /* worker may not export yet */
    }
  }

  async function readStream(pair?: string) {
    if (scanRef.current.phase === "ready" && !pair) {
      await pullStatus();
      return;
    }
    stopLogin();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setScan((current) => ({
      ...current,
      phase: current.phase === "ready" ? "ready" : "connecting",
      error: null,
      qrDataUrl: current.phase === "ready" ? current.qrDataUrl : null,
    }));

    try {
      const response = await fetch("/api/scan/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pair ? { pair } : {}),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        throw new Error("WhatsApp worker is unreachable. Please refresh and try Show QR again.");
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
          const line = chunk.split("\n").find((item) => item.startsWith("data: "));
          if (!line) continue;
          const payload = JSON.parse(line.slice(6)) as {
            snapshot?: Partial<ScanSnapshot> & { connected?: boolean };
            inbox?: import("@/lib/types").InboxMessage[];
          };
          const snapshot = (payload.snapshot ?? payload) as Partial<ScanSnapshot> & { connected?: boolean };
          applyScan(snapshot, true);
          if (payload.inbox && onInbox) onInbox(payload.inbox);
          if (snapshot.qrDataUrl || snapshot.pairingCode || snapshot.phase === "ready" || snapshot.connected) {
            setBusy(false);
          }
          if (snapshot.phase === "ready" || snapshot.connected) {
            void pullAndSaveLogin();
          }
        }
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      const live = await pullStatus().catch(() => scanRef.current);
      if (live.phase === "ready") return;
      setScan((current) => ({
        ...current,
        phase: current.persisted || current.phase === "ready" ? "ready" : "idle",
        error: live.phase === "ready" ? null : error instanceof Error ? error.message : "Login fail ho gaya.",
      }));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const mark = readLinkedMark();
    if (mark?.phone) {
      setSavedHere(true);
      setPhone(mark.phone);
    }
    if (readLocalArchive()) setSavedHere(true);

    void pullStatus().then((live) => {
      if (live.phase === "ready" || live.persisted) {
        if (live.phase === "ready") void pullAndSaveLogin();
        return;
      }
      if (live.phase === "qr" || live.qrDataUrl) {
        void readStream();
      }
    });

    const timer = window.setInterval(() => {
      void pullStatus();
    }, 2500);
    return () => {
      window.clearInterval(timer);
      stopLogin();
    };
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
      if (json.snapshot) applyScan(json.snapshot);
      const files = json.archive?.files ?? (json.archive as { files?: Record<string, string> } | undefined)?.files;
      const archive = files ? json.archive : json.archive;
      const creds = (archive as { files?: { ["creds.json"]?: string } } | null)?.files?.["creds.json"];
      if (!creds) {
        setExportNote("Pehle WhatsApp Linked karo, phir Export login.");
        return;
      }
      if (writeLocalArchive(archive)) setSavedHere(true);
      downloadJson("tarik-whatsapp-login.json", archive);
      const copied = await copyText(JSON.stringify(archive));
      setExportNote(copied ? "Login file download ho gayi, clipboard pe bhi." : "Login file download ho gayi.");
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
        setExportNote(snap.error ?? "Import failed. Please check the session file.");
        return;
      }
      if (writeLocalArchive(archive)) setSavedHere(true);
      applyScan(snap);
      setExportNote("Session imported successfully. Worker is reconnecting.");
    } catch {
      setExportNote("Could not read JSON file. Please use a valid export file.");
    }
  }

  async function logout() {
    stopLogin();
    setBusy(true);
    try {
      clearLocalArchive();
      setSavedHere(false);
      const response = await fetch("/api/scan", { method: "DELETE" });
      applyScan((await response.json()) as ScanSnapshot);
    } finally {
      setBusy(false);
    }
  }

  const remembered = scan.persisted || savedHere || scan.phase === "ready";

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>WhatsApp login</CardTitle>
            <CardDescription>
              Linked session worker pe save hoti hai. Refresh ke baad yahi status dikhega — naya QR tab hi jab logout ho.
            </CardDescription>
          </div>
          <Badge variant={scan.phase === "ready" || remembered ? "default" : "secondary"}>
            {phaseLabel(scan)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-[280px_1fr]">
        <div className="flex min-h-[240px] items-center justify-center rounded-2xl border bg-white p-4">
          {scan.qrDataUrl && scan.phase !== "ready" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={scan.qrDataUrl} alt="WhatsApp QR" className="size-[240px]" />
          ) : scan.pairingCode && scan.phase !== "ready" ? (
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Phone pe yeh code daalo</p>
              <p className="mt-2 font-heading text-3xl tracking-[0.25em]">{scan.pairingCode}</p>
            </div>
          ) : scan.phase === "ready" ? (
            <p className="px-4 text-center text-sm font-medium text-primary">
              Linked{scan.phone ? ` as ${scan.phone}` : ""}. Login worker pe save hai
              {scan.savedAt ? ` · ${scan.savedAt.slice(0, 16).replace("T", " ")} UTC` : ""}.
            </p>
          ) : remembered ? (
            <p className="px-4 text-center text-sm font-medium">
              Saved login mil gaya{scan.phone ? ` (${scan.phone})` : ""}. Reconnect ho raha hai.
            </p>
          ) : (
            <p className="px-4 text-center text-sm text-muted-foreground">
              {busy || scan.phase === "connecting"
                ? "WhatsApp se login maang raha hoon…"
                : "Show QR dabao. Scan ke baad Linked · saved dikhega."}
            </p>
          )}
        </div>
        <div className="space-y-3 text-sm leading-6">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Show QR — code box mein 20 second mein aana chahiye.</li>
            <li>Phone: Linked devices → Link a device → QR scan.</li>
            <li>Linked ke baad worker session save karta hai. Export se backup file milti hai.</li>
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
            <Button onClick={() => void readStream()} disabled={busy || scan.phase === "ready"}>
              {busy && !phone ? "QR aa raha hai…" : scan.phase === "ready" ? "Linked" : "Show QR"}
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
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
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
