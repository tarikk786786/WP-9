"use client";

import { useState } from "react";
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

  const online = live.llms.filter((item) => item.online);

  return (
    <Card className="overflow-hidden lg:col-span-2">
      <div className="h-1 bg-gradient-to-r from-emerald-400 via-teal-400 to-lime-300" />
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Always-live local brain</CardTitle>
            <CardDescription>
              Replies try every free local model on this machine — Ollama, LM
              Studio, Jan, llama.cpp, Kobold — then the on-device Flan model.
              Safety filters codes, money asks, and jailbreaks first.
            </CardDescription>
          </div>
          <Badge className="gap-1.5">
            <span className="size-1.5 animate-pulse rounded-full bg-primary-foreground" />
            Live since {new Date(live.startedAt).toLocaleTimeString()}
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
                <Badge variant={endpoint.online ? "default" : "outline"}>
                  {endpoint.online ? "ready" : "offline"}
                </Badge>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {endpoint.models.length
                  ? endpoint.models.slice(0, 3).join(", ")
                  : endpoint.online
                    ? "On-device fallback"
                    : "Start this app locally to use it"}
              </p>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {online.length} local engine{online.length === 1 ? "" : "s"} ready.
          Install Ollama and run <code className="rounded bg-muted px-1">ollama pull llama3.2</code>{" "}
          for a stronger free model. Click a card to refresh.
        </p>
      </CardContent>
    </Card>
  );
}
