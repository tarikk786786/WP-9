import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="min-h-full bg-background">
      <main className="mx-auto max-w-3xl p-6 grid gap-6">
        <div>
          <p className="text-sm text-muted-foreground">Baileys · persistent worker · Vercel admin</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">WhatsApp auto-reply bot</h1>
          <p className="mt-3 text-muted-foreground leading-7">
            A normal WhatsApp account connects through Baileys on a long-running Node worker.
            Vercel only hosts this dashboard. The socket never runs inside a serverless function.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/admin/dashboard">Open admin</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/desk">Hinglish simulator desk</Link>
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>How it is wired</CardTitle>
            <CardDescription>Worker must stay up. Web can scale independently.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-muted-foreground">
            <p>WhatsApp → Baileys worker → bot engine (commands, rules, FAQ, knowledge, OpenAI) → reply.</p>
            <p>Customers, conversations, messages, FAQs, rules, and session files persist in Supabase (or memory for local demos).</p>
            <p>Set WORKER_API_URL and WORKER_API_SECRET on Vercel so the dashboard can reach the worker.</p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
