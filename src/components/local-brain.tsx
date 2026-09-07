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

  return (
    <Card className="overflow-hidden lg:col-span-2">
      <div className="h-1 bg-gradient-to-r from-emerald-400 via-teal-400 to-lime-300" />
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Saari brains live hain</CardTitle>
            <CardDescription>
              Yeh Tarik Islam ki live messaging brain hai. Facts
              tarikislam.in se aate hain. Extra local models tab join
              karte hain jab woh on hon.
            </CardDescription>
          </div>
          <Badge className="gap-1.5">
            <span className="size-1.5 animate-pulse rounded-full bg-primary-foreground" />
            All live
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
                  : "Soft Hinglish voice · live now"}
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
