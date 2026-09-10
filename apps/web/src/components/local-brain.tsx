"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { LiveStatus } from "@/lib/types";

export function LocalBrain({ initial }: { initial: LiveStatus }) {
  const [live, setLive] = useState(initial);

  async function refresh() {
    const response = await fetch("/api/live");
    if (!response.ok) return;
    setLive((await response.json()) as LiveStatus);
  }

  useEffect(() => {
    let active = true;
    async function fetchLive() {
      try {
        const response = await fetch("/api/live");
        if (response.ok && active) {
          setLive((await response.json()) as LiveStatus);
        }
      } catch {
        // ignore network error
      }
    }

    const timer = window.setInterval(() => {
      void fetchLive();
    }, 15_000);

    const initialTimer = setTimeout(() => {
      void fetchLive();
    }, 0);

    return () => {
      active = false;
      window.clearInterval(timer);
      clearTimeout(initialTimer);
    };
  }, []);

  const waLive = live.whatsapp.phase === "ready";

  return (
    <Card className="overflow-hidden lg:col-span-2">
      <div className="h-1 bg-gradient-to-r from-emerald-400 via-teal-400 to-lime-300" />
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>WhatsApp Continuous Service</CardTitle>
            <CardDescription>
              The background worker maintains continuous WhatsApp connection with automatic reconnection and reliable message processing.
            </CardDescription>
          </div>
          <Badge className="gap-1.5" variant={waLive ? "default" : "secondary"}>
            <span className="size-1.5 animate-pulse rounded-full bg-primary-foreground" />
            {waLive ? `Live · ${live.whatsapp.phone ?? "linked"}` : live.whatsapp.phase}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {live.llms.map((endpoint) => (
            <button
              key={endpoint.id}
              type="button"
              onClick={() => void refresh()}
              className="rounded-xl border bg-card px-3 py-3 text-left transition hover:border-primary/40"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{endpoint.name}</p>
                <Badge>{endpoint.live ? "live" : "soon"}</Badge>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {endpoint.online && endpoint.models.length
                  ? endpoint.models.slice(0, 3).join(", ")
                  : "Natural conversational AI · live now"}
              </p>
            </button>
          ))}
        </div>
        {live.profile ? (
          <div className="rounded-xl border bg-muted/40 px-3 py-3 text-sm">
            <p className="font-medium">{live.profile.name}</p>
            <p className="text-muted-foreground">{live.profile.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {live.profile.site.replace("https://", "")} · {live.profile.studio} ·{" "}
              {live.profile.accepting}
            </p>
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Tone: friendly, slow, soft. Hinglish pehle. Safety pehle. Click a card
          to refresh the stack.
        </p>
      </CardContent>
    </Card>
  );
}
